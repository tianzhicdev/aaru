import Foundation
import Supabase

final class RealtimeBridge {
    private var client: SupabaseClient?
    private var channels: [RealtimeChannelV2] = []
    private var tasks: [Task<Void, Never>] = []
    private var subscriptions: [RealtimeSubscription] = []

    func start(
        supabaseURL: URL?,
        anonKey: String?,
        instanceID: UUID?,
        userID: UUID?,
        onRealtimeStatus: @escaping @MainActor (String) -> Void,
        onWorldTick: @escaping @MainActor (WorldBroadcastPayload) -> Void,
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

        guard let instanceID else {
            return
        }

        let worldChannel = client.channel("world:\(instanceID.uuidString)")
        let worldTickStream = worldChannel.broadcastStream(event: "tick")
        let conversationChannel = client.channel("aaru-conversations")
        let conversationsAsA = userID.map {
            conversationChannel.postgresChange(
                AnyAction.self,
                schema: "public",
                table: "conversations",
                filter: .eq("user_a_id", value: $0.uuidString)
            )
        }
        let conversationsAsB = userID.map {
            conversationChannel.postgresChange(
                AnyAction.self,
                schema: "public",
                table: "conversations",
                filter: .eq("user_b_id", value: $0.uuidString)
            )
        }
        let impressionsFromUser = userID.map {
            conversationChannel.postgresChange(
                AnyAction.self,
                schema: "public",
                table: "impression_edges",
                filter: .eq("user_id", value: $0.uuidString)
            )
        }
        let impressionsToUser = userID.map {
            conversationChannel.postgresChange(
                AnyAction.self,
                schema: "public",
                table: "impression_edges",
                filter: .eq("target_user_id", value: $0.uuidString)
            )
        }
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
            for await message in worldTickStream {
                do {
                    guard let payloadObject = message["payload"]?.objectValue else {
                        await onRealtimeStatus("World tick missing payload")
                        continue
                    }
                    let payload = try payloadObject.decode(
                        as: WorldBroadcastPayload.self,
                        decoder: PostgrestClient.Configuration.jsonDecoder
                    )
                    await onWorldTick(payload)
                } catch {
                    await onRealtimeStatus("World tick decode failed: \(error.localizedDescription)")
                }
            }
        })

        tasks.append(Task {
            do {
                try await conversationChannel.subscribeWithError()
                await onRealtimeStatus("Conversation channel subscribed")
                await withTaskGroup(of: Void.self) { group in
                    if let conversationsAsA {
                        group.addTask {
                            for await _ in conversationsAsA {
                                await onInboxChange()
                                await onConversationChange()
                            }
                        }
                    }
                    if let conversationsAsB {
                        group.addTask {
                            for await _ in conversationsAsB {
                                await onInboxChange()
                                await onConversationChange()
                            }
                        }
                    }
                    if let impressionsFromUser {
                        group.addTask {
                            for await _ in impressionsFromUser {
                                await onInboxChange()
                                await onConversationChange()
                            }
                        }
                    }
                    if let impressionsToUser {
                        group.addTask {
                            for await _ in impressionsToUser {
                                await onInboxChange()
                                await onConversationChange()
                            }
                        }
                    }
                }
            } catch {
                await onRealtimeStatus("Conversation channel failed: \(error.localizedDescription)")
                return
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
