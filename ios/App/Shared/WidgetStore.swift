import Foundation
import WidgetKit

struct WidgetTaskItem: Codable {
  var id: String
  var title: String
  var done: Bool
  var revision: Int
}

final class WidgetStore {
  static let shared = WidgetStore()
  private let defaults = UserDefaults(suiteName: "group.com.notio.app.widget")
  private let outboxKey = "notio.widget.outbox"
  private let snapshotKey = "notio.widget.snapshot"

  var level: Int {
    (defaults?.dictionary(forKey: snapshotKey)?["level"] as? Int) ?? 1
  }

  var statusText: String {
    let pending = outboxCount
    if pending > 0 { return "Done · waiting to sync (\(pending))" }
    return (defaults?.dictionary(forKey: snapshotKey)?["status"] as? String) ?? "Next steps"
  }

  var tasks: [WidgetTaskItem] {
    guard let data = defaults?.data(forKey: snapshotKey),
          let decoded = try? JSONDecoder().decode(Snapshot.self, from: data)
    else { return [] }
    return decoded.tasks
  }

  private var outboxCount: Int {
    (defaults?.array(forKey: outboxKey) as? [Data])?.count ?? 0
  }

  func saveSnapshot(level: Int, status: String, tasks: [WidgetTaskItem]) {
    let snap = Snapshot(level: level, status: status, tasks: tasks)
    if let data = try? JSONEncoder().encode(snap) {
      defaults?.set(data, forKey: snapshotKey)
    }
    WidgetCenter.shared.reloadAllTimelines()
  }

  func queueCompletion(taskId: String) async throws {
    var box = (defaults?.array(forKey: outboxKey) as? [Data]) ?? []
    let action = OutboxAction(id: UUID().uuidString, taskId: taskId, createdAt: Date())
    if let data = try? JSONEncoder().encode(action) {
      box.append(data)
      defaults?.set(box, forKey: outboxKey)
    }
    if var list = tasks as [WidgetTaskItem]? {
      list = list.map { item in
        var copy = item
        if copy.id == taskId { copy.done = true }
        return copy
      }
      saveSnapshot(level: level, status: "Done · waiting to sync", tasks: list)
    }
  }

  func clearAccount() {
    defaults?.removeObject(forKey: outboxKey)
    defaults?.removeObject(forKey: snapshotKey)
    WidgetCenter.shared.reloadAllTimelines()
  }

  private struct Snapshot: Codable {
    var level: Int
    var status: String
    var tasks: [WidgetTaskItem]
  }

  private struct OutboxAction: Codable {
    var id: String
    var taskId: String
    var createdAt: Date
  }
}
