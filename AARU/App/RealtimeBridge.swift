import Foundation
import Supabase

final class RealtimeBridge {
    private var client: SupabaseClient?
    private var channels: [RealtimeChannelV2] = []
    private var tasks: [Task<Void, Never>] = []
    private let decoder = PostgrestClient.Configuration.jsonDecoder

    func start(
        supabaseURL: URL?,
        anonKey: String?,
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

        tasks.append(Task {
            do {
                try await worldChannel.subscribeWithError()
            } catch {
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
                for await _ in conversationStream {
                    await onInboxChange()
                    await onConversationChange()
                }
            } catch {
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
            await messageChannel.subscribe()
            for await _ in messageStream {
                await onConversationChange()
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
