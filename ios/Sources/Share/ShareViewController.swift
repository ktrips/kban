import UIKit
import SwiftUI
import UniformTypeIdentifiers

/// 共有シートの「kban」。写真・スクリーンショット(複数可)やテキスト/URL を受け取り、メモを足してバックログに送る。
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let model = ShareModel(items: extensionContext?.inputItems as? [NSExtensionItem] ?? [], close: { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }, cancel: { [weak self] in
            self?.extensionContext?.cancelRequest(withError: CaptureError(message: "キャンセル"))
        })
        let host = UIHostingController(rootView: ShareView(model: model))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }
}

@MainActor
final class ShareModel: ObservableObject {
    @Published var memo = ""
    @Published var images: [UIImage] = []
    @Published var targets: [Target] = []
    @Published var selected: Target?
    @Published var status: String?
    @Published var sending = false
    let close: () -> Void
    let cancel: () -> Void
    private let items: [NSExtensionItem]

    init(items: [NSExtensionItem], close: @escaping () -> Void, cancel: @escaping () -> Void) {
        self.items = items; self.close = close; self.cancel = cancel
        Task { await load() }
    }

    func load() async {
        var texts: [String] = []
        for provider in items.flatMap({ $0.attachments ?? [] }) {
            if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                if let data = await data(provider, UTType.image.identifier), let img = UIImage(data: data) { images.append(img) }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                if let u = await object(provider, UTType.url.identifier) as? URL { texts.append(u.absoluteString) }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                if let s = await object(provider, UTType.plainText.identifier) as? String { texts.append(s) }
            }
        }
        if memo.isEmpty { memo = texts.joined(separator: "\n") }
        do {
            let t = try await CaptureAPI.targets()
            targets = t.targets
            selected = t.targets.first { $0.board == t.last?.board && $0.repo == t.last?.repo } ?? t.targets.first
            if t.targets.isEmpty { status = "編集できるボードがありません。kban でボードとリポジトリを作ってください" }
        } catch { status = error.localizedDescription }
    }

    private func data(_ p: NSItemProvider, _ type: String) async -> Data? {
        await withCheckedContinuation { c in p.loadDataRepresentation(forTypeIdentifier: type) { d, _ in c.resume(returning: d) } }
    }
    private func object(_ p: NSItemProvider, _ type: String) async -> NSSecureCoding? {
        await withCheckedContinuation { c in p.loadItem(forTypeIdentifier: type, options: nil) { o, _ in c.resume(returning: o) } }
    }

    /// 長辺 1600px の JPEG にして送る
    private func jpeg(_ img: UIImage) -> Data? {
        let k = min(1, 1600 / max(img.size.width, img.size.height))
        let size = CGSize(width: img.size.width * k, height: img.size.height * k)
        let r = UIGraphicsImageRenderer(size: size, format: { let f = UIGraphicsImageRendererFormat(); f.scale = 1; return f }())
        return r.jpegData(withCompressionQuality: 0.85) { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
    }

    func send() async {
        sending = true; status = nil
        defer { sending = false }
        do {
            try await CaptureAPI.send(memo: memo, images: images.compactMap(jpeg), to: selected)
            close()
        } catch { status = error.localizedDescription }
    }
}

struct ShareView: View {
    @ObservedObject var model: ShareModel
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $model.memo).frame(minHeight: 110).focused($focused)
                }
                if !model.images.isEmpty {
                    Section("スクリーンショット") {
                        ScrollView(.horizontal) {
                            HStack { ForEach(model.images.indices, id: \.self) { i in
                                Image(uiImage: model.images[i]).resizable().scaledToFit().frame(height: 120).clipShape(RoundedRectangle(cornerRadius: 8))
                            } }
                        }
                    }
                }
                if !model.targets.isEmpty {
                    Section("追加先") {
                        Picker("リポジトリ", selection: $model.selected) {
                            ForEach(model.targets) { t in Text("\(t.repo)(\(t.boardName))").tag(Optional(t)) }
                        }
                    }
                }
                if let s = model.status { Section { Text(s).foregroundStyle(.red).font(.footnote) } }
            }
            .navigationTitle("kban に追加")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル", action: model.cancel) }
                ToolbarItem(placement: .confirmationAction) {
                    if model.sending { ProgressView() }
                    else { Button("追加") { Task { await model.send() } }.bold().disabled(model.selected == nil || (model.memo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && model.images.isEmpty)) }
                }
            }
            .onAppear { focused = true }
        }
    }
}
