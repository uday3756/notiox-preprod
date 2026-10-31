import AppIntents
import Foundation

@available(iOS 17.0, *)
struct CompleteTaskIntent: AppIntent {
  static var title: LocalizedStringResource = "Complete NotioX step"

  @Parameter(title: "Task ID")
  var taskId: String

  init() {
    self.taskId = ""
  }

  init(taskId: String) {
    self.taskId = taskId
  }

  func perform() async throws -> some IntentResult {
    try await WidgetStore.shared.queueCompletion(taskId: taskId)
    return .result()
  }
}
