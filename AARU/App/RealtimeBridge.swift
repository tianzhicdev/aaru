import Foundation
import Supabase

final class RealtimeBridge {
    private var client: SupabaseClient?
    private var channels: [RealtimeChannelV2] = []
    private var tasks: [Task<Void, Never>] = []
    private var subscriptions: [RealtimeSubscription] = []
    private let decoder = PostgrestClient.Configuration.jsonDecoder

    func start(
        supabaseURL: URL?,
        anonKey: String?,
        onRealtimeStatus: @escaping @MainActor (String) -> Void,
        onWorldInsert: @escaping @MainActor () -> Void,
        onWorldUpdate: @escaping @MainActor (RealtimeAgentPosition, RealtimeAgentPosition) -> Void,
        onWorldDelete: @escaping @MainActor () -> Void,
        onInboxChange: @escaping @MainActor () -> Void,
        onConversationChange: @escaping @MainActor () -> Void
    ) {
        stop()

        guard let supabaseURL, let anonKey else {
            return
        }

        let client = SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: anonKey,
            options: SupabaseClientOptions(
                auth: .init(emitLocalSessionAsInitialSession: true)
            )
        )
        self.client = client

        let clientStatusSubscription = client.realtimeV2.onStatusChange { status in
            Task { @MainActor in
                onRealtimeStatus("Realtime client \(String(describing: status))")
            }
        }

        let worldChannel = client.channel("aaru-world")
        let worldInsertStream = worldChannel.postgresChange(InsertAction.self, schema: "public", table: "agent_positions")
        let worldUpdateStream = worldChannel.postgresChange(UpdateAction.self, schema: "public", table: "agent_positions")
        let worldDeleteStream = worldChannel.postgresChange(DeleteAction.self, schema: "public", table: "agent_positions")
        let conversationChannel = client.channel("aaru-conversations")
        let conversationStream = conversationChannel.postgresChange(AnyAction.self, schema: "public", table: "conversations")
        let compatibilityStream = conversationChannel.postgresChange(AnyAction.self, schema: "public", table: "impression_edges")
        let messageChannel = client.channel("aaru-messages")
        let messageStream = messageChannel.postgresChange(AnyAction.self, schema: "public", table: "messages")
        let baMessageStream = messageChannel.postgresChange(AnyAction.self, schema: "public", table: "ba_messages")

        channels = [worldChannel, conversationChannel, messageChannel]

        let worldStatusSubscription = worldChannel.onStatusChange { status in
            Task { @MainActor in
                onRealtimeStatus("World channel \(String(describing: status))")
            }
        }
        let conversationStatusSubscription = conversationChannel.onStatusChange { status in
            Task { @MainActor in
                onRealtimeStatus("Conversation channel \(String(describing: status))")
            }
        }
        let messageStatusSubscription = messageChannel.onStatusChange { status in
            Task { @MainActor in
                onRealtimeStatus("Message channel \(String(describing: status))")
            }
        }
        subscriptions = [
            clientStatusSubscription,
            worldStatusSubscription,
            conversationStatusSubscription,
            messageStatusSubscription
        ]

        tasks.append(Task {
            do {
                try await worldChannel.subscribeWithError()
                await onRealtimeStatus("World channel subscribed")
            } catch {
                await onRealtimeStatus("World channel failed: \(error.localizedDescription)")
                return
            }
        })

        tasks.append(Task {
            for await _ in worldInsertStream {
                await onWorldInsert()
            }
        })

        tasks.append(Task {
            for await update in worldUpdateStream {
                guard
                    let oldRow = try? update.decodeOldRecord(as: RealtimeAgentPosition.self, decoder: self.decoder),
                    let newRow = try? update.decodeRecord(as: RealtimeAgentPosition.self, decoder: self.decoder)
                else {
                    await onWorldInsert()
                    continue
                }
                await onWorldUpdate(oldRow, newRow)
            }
        })

        tasks.append(Task {
            for await _ in worldDeleteStream {
                await onWorldDelete()
            }
        })

        tasks.append(Task {
            do {
                try await conversationChannel.subscribeWithError()
                await onRealtimeStatus("Conversation channel subscribed")
                for await _ in conversationStream {
                    await onInboxChange()
                    await onConversationChange()
                }
            } catch {
                await onRealtimeStatus("Conversation channel failed: \(error.localizedDescription)")
                return
            }
        })

        tasks.append(Task {
            for await _ in compatibilityStream {
                await onInboxChange()
                await onConversationChange()
            }
        })

        tasks.append(Task {
            do {
                try await messageChannel.subscribeWithError()
                await onRealtimeStatus("Message channel subscribed")
                for await _ in messageStream {
                    await onConversationChange()
                }
            } catch {
                await onRealtimeStatus("Message channel failed: \(error.localizedDescription)")
                return
            }
        })

        tasks.append(Task {
            for await _ in baMessageStream {
                await onConversationChange()
            }
        })

    }

    func stop() {
        tasks.forEach { $0.cancel() }
        tasks.removeAll()
        subscriptions.forEach { $0.cancel() }
        subscriptions.removeAll()

        let channels = self.channels
        let client = self.client
        self.channels = []
        self.client = nil

        Task {
            for channel in channels {
                await client?.removeChannel(channel)
            }
        }
    }
}
