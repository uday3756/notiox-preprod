import Foundation
import Capacitor
import WidgetKit

@objc(NotioWidgetPlugin)
public class NotioWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "NotioWidgetPlugin"
  public let jsName = "NotioWidget"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
  ]

  @objc func configure(_ call: CAPPluginCall) {
    let level = call.getInt("level") ?? 1
    let status = call.getString("status") ?? "Next steps"
    let privateTitles = call.getBool("privateTitles") ?? false
    var tasks: [WidgetTaskItem] = []
    if let raw = call.getArray("tasks", JSObject.self) {
      for item in raw {
        let id = item["id"] as? String ?? UUID().uuidString
        let title = privateTitles ? "Step" : (item["title"] as? String ?? "Step")
        let done = item["done"] as? Bool ?? false
        let revision = item["revision"] as? Int ?? 0
        tasks.append(WidgetTaskItem(id: id, title: title, done: done, revision: revision))
      }
    }
    WidgetStore.shared.saveSnapshot(level: level, status: status, tasks: tasks)
    call.resolve()
  }

  @objc func clear(_ call: CAPPluginCall) {
    WidgetStore.shared.clearAccount()
    call.resolve()
  }

  @objc func pause(_ call: CAPPluginCall) {
    WidgetStore.shared.clearAccount()
    call.resolve()
  }
}
