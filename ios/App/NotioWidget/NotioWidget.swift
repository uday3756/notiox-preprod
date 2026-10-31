import WidgetKit
import SwiftUI

struct NotioEntry: TimelineEntry {
  let date: Date
  let level: Int
  let status: String
  let tasks: [(id: String, title: String, done: Bool)]
}

struct NotioProvider: TimelineProvider {
  func placeholder(in context: Context) -> NotioEntry {
    NotioEntry(date: Date(), level: 1, status: "NotioX", tasks: [])
  }

  func getSnapshot(in context: Context, completion: @escaping (NotioEntry) -> Void) {
    completion(loadEntry())
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<NotioEntry>) -> Void) {
    let entry = loadEntry()
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
  }

  private func loadEntry() -> NotioEntry {
    let store = WidgetStore.shared
    return NotioEntry(
      date: Date(),
      level: store.level,
      status: store.statusText,
      tasks: store.tasks.prefix(3).map { ($0.id, $0.title, $0.done) }
    )
  }
}

struct NotioWidgetEntryView: View {
  var entry: NotioEntry

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack {
        Text("🐬").font(.largeTitle)
        Text("Lv \(entry.level)").font(.caption)
      }
      .frame(width: 72)
      VStack(alignment: .leading, spacing: 8) {
        Text(entry.status).font(.caption).foregroundStyle(.secondary)
        ForEach(entry.tasks, id: \.id) { task in
          HStack {
            if #available(iOSApplicationExtension 17.0, *) {
              Button(intent: CompleteTaskIntent(taskId: task.id)) {
                Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
              }
              .buttonStyle(.plain)
            } else {
              Link(destination: URL(string: "notiox://task/\(task.id)")!) {
                Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
              }
            }
            Text(task.title).font(.subheadline).lineLimit(3)
          }
        }
      }
    }
    .padding(12)
    .containerBackground(for: .widget) {
      Color(red: 9 / 255, green: 13 / 255, blue: 21 / 255)
    }
  }
}

@main
struct NotioWidget: Widget {
  let kind = "NotioWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: NotioProvider()) { entry in
      NotioWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("NotioX next steps")
    .description("Complete steps without opening the app.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}
