import Foundation
import WebKit

/// Liefert die gebündelte Web-App unter app://localhost/… aus.
///
/// Warum kein file://-URL? ES-Module, IndexedDB und fetch() brauchen einen echten Origin.
/// Ein eigenes URL-Schema gibt der Web-App einen stabilen Origin, unter dem die
/// Inventurdaten (IndexedDB) dauerhaft gespeichert bleiben.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "app"
    static let host = "localhost"

    private let root: URL = {
        guard let url = Bundle.main.url(forResource: "web", withExtension: nil) else {
            fatalError("Ordner 'web' fehlt im App-Bundle. Wurde das Projekt mit xcodegen erzeugt?")
        }
        return url.standardizedFileURL
    }()

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let fileURL = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL

        // Kein Zugriff außerhalb des web-Ordners (z. B. ../)
        guard fileURL.path.hasPrefix(root.path + "/"),
              let data = try? Data(contentsOf: fileURL) else {
            respond(urlSchemeTask, url: url, status: 404, data: Data("Not found".utf8), mime: "text/plain")
            return
        }
        respond(urlSchemeTask, url: url, status: 200, data: data, mime: Self.mimeType(for: fileURL.pathExtension))
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // Antworten erfolgen synchron – nichts abzubrechen.
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, data: Data, mime: String) {
        let headers = [
            "Content-Type": mime,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else {
            task.didFailWithError(URLError(.cannotParseResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "webmanifest": return "application/manifest+json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}
