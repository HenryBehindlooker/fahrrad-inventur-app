import UIKit
import WebKit

/// Native Funktionen für die Web-App (siehe web/js/native.js):
/// - "share":  Datei (CSV/JSON) über das iOS-Teilen-Menü sichern/teilen
/// - "print":  Druckdialog (window.print() funktioniert in WKWebView nicht)
/// - "haptic": kurzes haptisches Feedback
/// Außerdem: externe Links in Safari öffnen, JS-Dialoge nativ anzeigen.
@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    weak var webView: WKWebView?

    // MARK: - Nachrichten aus JavaScript

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "share":
            guard let base64 = body["base64"] as? String,
                  let data = Data(base64Encoded: base64) else { return }
            let filename = (body["filename"] as? String).flatMap(Self.safeFilename) ?? "export.dat"
            share(data: data, filename: filename)
        case "print":
            printPage()
        case "haptic":
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        default:
            break
        }
    }

    private static func safeFilename(_ name: String) -> String? {
        let cleaned = name.components(separatedBy: CharacterSet(charactersIn: "/\\:")).joined(separator: "-")
        return cleaned.isEmpty ? nil : cleaned
    }

    private func share(data: Data, filename: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            presentAlert(title: "Export fehlgeschlagen", message: error.localizedDescription)
            return
        }
        let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = activity.popoverPresentationController, let webView {
            popover.sourceView = webView
            popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        topViewController()?.present(activity, animated: true)
    }

    private func printPage() {
        guard let webView else { return }
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = webView.title ?? "Fahrrad-Inventur"
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = webView.viewPrintFormatter()
        controller.present(animated: true)
    }

    // MARK: - Navigation

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        let isAppContent = url.scheme == AppSchemeHandler.scheme
            || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data"
            || (AppConfig.remoteURL?.host != nil && url.host == AppConfig.remoteURL?.host)
        if isAppContent && navigationAction.targetFrame != nil {
            decisionHandler(.allow)
        } else {
            // Externe Links (z. B. console.anthropic.com) in Safari öffnen
            if ["http", "https", "mailto", "tel"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS beendet den Web-Prozess gelegentlich bei Speicherknappheit – neu laden.
        webView.reload()
    }

    // MARK: - JS-Dialoge (alert/confirm) und target=_blank

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        guard let top = topViewController() else { return completionHandler() }
        top.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Abbrechen", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        guard let top = topViewController() else { return completionHandler(false) }
        top.present(alert, animated: true)
    }

    // MARK: - Hilfen

    private func presentAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        topViewController()?.present(alert, animated: true)
    }

    private func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first
        var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
