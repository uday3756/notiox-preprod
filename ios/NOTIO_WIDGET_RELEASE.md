# iOS widget release gate

Status: **SOURCE ADDED** under `ios/App/NotioWidget/`, `ios/App/Shared/WidgetStore.swift`, and `ios/App/App/NotioWidgetPlugin.swift`. Still needs Mac/Xcode to register the WidgetKit extension target, App Group `group.com.notio.app.widget`, Keychain sharing, and signing.

## Included sources
- `NotioWidget.swift` — medium/large widget UI, iOS 17+ App Intent checkbox, older iOS deep-link fallback
- `CompleteTaskIntent.swift` — interactive completion intent
- `WidgetStore.swift` — App Group snapshot + durable outbox
- `NotioWidgetPlugin.swift` — Capacitor bridge configure/clear/pause

## Shared HTTP contracts
Use existing `/api/v1/widgets/snapshot` and `/api/v1/widgets/completion` (same as Android).

## Remaining Mac steps
1. Open `ios/App/App.xcodeproj` on macOS.
2. File → New → Target → Widget Extension (`NotioWidget`).
3. Add App Group + shared Keychain to App + Extension.
4. Add the Swift files above to the correct targets.
5. Build for simulator, then physical device: closed-app completion, offline outbox, account switch, expired session.

Windows cannot complete signing or device proof for iOS.
