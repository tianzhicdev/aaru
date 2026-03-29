import Foundation
import UserNotifications
import OSLog

@MainActor
final class NotificationManager: NSObject, ObservableObject {
    private let logger = Logger(subsystem: "com.trythumos.app", category: "notifications")
    @Published var isPermissionGranted = false

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    /// Request local notification permission. Call after first completed session.
    func requestPermission() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            isPermissionGranted = granted
            logger.info("Notification permission: \(granted ? "granted" : "denied")")
            return granted
        } catch {
            logger.error("Notification permission request failed: \(error.localizedDescription)")
            return false
        }
    }

    /// Schedule a local notification for next Saturday 8pm that is >3 days away.
    /// Cancels all existing pending notifications first.
    func scheduleWeeklyNotification() async {
        // Only schedule if we have permission (or can get it)
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized else {
            logger.info("Skipping notification schedule — not authorized")
            return
        }

        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()

        guard let targetDate = nextSaturdayAt8PM() else {
            logger.error("Failed to compute next Saturday 8pm")
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Thumos"
        content.body = "Thumos asked you a question"
        content.sound = .default

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: targetDate
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

        let request = UNNotificationRequest(
            identifier: "weekly-reengagement",
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            logger.info("Scheduled notification for \(targetDate)")
        } catch {
            logger.error("Failed to schedule notification: \(error.localizedDescription)")
        }
    }

    /// Compute next Saturday at 8pm local time that is >3 days from now.
    private func nextSaturdayAt8PM() -> Date? {
        let calendar = Calendar.current
        let now = Date()

        // Find next Saturday (weekday 7)
        guard var nextSaturday = calendar.nextDate(
            after: now,
            matching: DateComponents(hour: 20, minute: 0, second: 0, weekday: 7),
            matchingPolicy: .nextTime
        ) else {
            return nil
        }

        // If this Saturday is <=3 days away, skip to the following Saturday
        let daysUntil = calendar.dateComponents([.day], from: now, to: nextSaturday).day ?? 0
        if daysUntil <= 3 {
            guard let following = calendar.date(byAdding: .weekOfYear, value: 1, to: nextSaturday) else {
                return nil
            }
            nextSaturday = following
        }

        return nextSaturday
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension NotificationManager: UNUserNotificationCenterDelegate {
    /// Handle notification when app is in foreground — show it anyway.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    /// Handle notification tap.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}
