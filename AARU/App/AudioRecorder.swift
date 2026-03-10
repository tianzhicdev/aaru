import AVFoundation
import Foundation

@MainActor
final class AudioRecorder: ObservableObject {
    @Published var isRecording = false
    private var recorder: AVAudioRecorder?
    private var fileURL: URL?

    func startRecording() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .default)
            try session.setActive(true)
        } catch {
            return
        }

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("aaru_voice_\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]

        do {
            let audioRecorder = try AVAudioRecorder(url: url, settings: settings)
            audioRecorder.record()
            recorder = audioRecorder
            fileURL = url
            isRecording = true
        } catch {
            return
        }
    }

    func stopRecording() -> URL? {
        recorder?.stop()
        recorder = nil
        isRecording = false
        return fileURL
    }

    func cleanup() {
        if let url = fileURL {
            try? FileManager.default.removeItem(at: url)
            fileURL = nil
        }
    }
}
