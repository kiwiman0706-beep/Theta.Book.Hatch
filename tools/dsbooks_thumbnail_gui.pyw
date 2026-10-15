from __future__ import annotations

import json
import os
import queue
import sys
import threading
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from dsbooks_thumbnails import generate_cache


APP_NAME = "DSBooks 表紙キャッシュ作成"
APP_DIR = Path(os.environ.get("APPDATA", str(Path.home()))) / "DSBooksThumbnailHelper"
CONFIG = APP_DIR / "settings.json"


class ThumbnailApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title(APP_NAME)
        self.root.geometry("760x620")
        self.root.minsize(680, 560)
        self.events: queue.Queue = queue.Queue()
        self.running = False

        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        style.configure("TFrame", background="#f3f1eb")
        style.configure("TLabel", background="#f3f1eb", foreground="#292b27", font=("Yu Gothic UI", 10))
        style.configure("Title.TLabel", background="#173729", foreground="#f4f5f1", font=("Yu Gothic UI", 18, "bold"))
        style.configure("Sub.TLabel", background="#173729", foreground="#c5d7c7", font=("Yu Gothic UI", 9))
        style.configure("TEntry", padding=8, fieldbackground="#fffefa")
        style.configure("Primary.TButton", background="#315c43", foreground="white", padding=(16, 10), font=("Yu Gothic UI", 10, "bold"))
        style.map("Primary.TButton", background=[("disabled", "#9aa89c"), ("active", "#254c35")])
        style.configure("TButton", padding=(9, 7))
        style.configure("TProgressbar", troughcolor="#e1e4dc", background="#4c805e")

        outer = ttk.Frame(root, padding=0)
        outer.pack(fill="both", expand=True)
        header = tk.Frame(outer, bg="#173729", padx=24, pady=18)
        header.pack(fill="x")
        ttk.Label(header, text="DSBooks", style="Title.TLabel").pack(anchor="w")
        ttk.Label(header, text="表紙・シリーズ・Obsidianメタデータを作成", style="Sub.TLabel").pack(anchor="w", pady=(2, 0))

        body = ttk.Frame(outer, padding=(24, 18, 24, 14))
        body.pack(fill="both", expand=True)
        ttk.Label(body, text="PCで開く蔵書フォルダ").grid(row=0, column=0, sticky="w")
        self.source = tk.StringVar()
        ttk.Entry(body, textvariable=self.source).grid(row=1, column=0, sticky="ew", pady=(5, 14))
        ttk.Button(body, text="フォルダを選択…", command=self.choose_folder).grid(row=1, column=1, padx=(9, 0), pady=(5, 14))

        ttk.Label(body, text="同じ場所のDSMパス").grid(row=2, column=0, sticky="w")
        self.nas_root = tk.StringVar()
        ttk.Entry(body, textvariable=self.nas_root).grid(row=3, column=0, columnspan=2, sticky="ew", pady=(5, 5))
        ttk.Label(body, text="例：PC上 Z:\\8Books\\⑧カメラ　　DSM上 /8Books/⑧カメラ", foreground="#6f756e").grid(row=4, column=0, columnspan=2, sticky="w", pady=(0, 14))

        note = tk.Frame(body, bg="#e7e9e1", padx=12, pady=10)
        note.grid(row=5, column=0, columnspan=2, sticky="ew", pady=(0, 14))
        tk.Label(note, text="ePub・PDF・M4A/M4Bの表紙を小さくして保存します。元の本は変更しません。\n2回目以降は変更された本だけ処理します。外部サイトへの通信はありません。", bg="#e7e9e1", fg="#454b43", justify="left", font=("Yu Gothic UI", 9)).pack(anchor="w")

        action = ttk.Frame(body)
        action.grid(row=6, column=0, columnspan=2, sticky="ew")
        self.run_button = ttk.Button(action, text="表紙キャッシュを作成", style="Primary.TButton", command=self.start)
        self.run_button.pack(side="left")
        ttk.Button(action, text="メタデータを開く", command=self.open_metadata).pack(side="left", padx=6)
        self.status = tk.StringVar(value="準備完了")
        ttk.Label(action, textvariable=self.status).pack(side="left", padx=14)
        self.progress = ttk.Progressbar(action, mode="indeterminate", length=130)
        self.progress.pack(side="right")

        ttk.Label(body, text="処理状況").grid(row=7, column=0, columnspan=2, sticky="w", pady=(14, 5))
        self.output = tk.Text(body, height=12, wrap="word", state="disabled", bg="#fffefa", fg="#394139", relief="solid", borderwidth=1, font=("Yu Gothic UI", 9), padx=10, pady=8)
        self.output.grid(row=8, column=0, columnspan=2, sticky="nsew")
        body.columnconfigure(0, weight=1)
        body.rowconfigure(8, weight=1)
        footer = tk.Frame(outer, bg="#101814", padx=20, pady=8)
        footer.pack(fill="x")
        tk.Label(footer, text="キャッシュ先: 選択したフォルダ内の _DSBooksCache", bg="#101814", fg="#c2cec4", font=("Yu Gothic UI", 8)).pack(anchor="w")

        self.load_config()
        self.root.after(100, self.poll_events)

    def open_metadata(self):
        folder = Path(self.source.get()) / "_DSBooksCache" / "metadata"
        if not folder.is_dir():
            messagebox.showinfo(APP_NAME, "先にキャッシュを作成してください。")
            return
        if sys.platform == "win32":
            os.startfile(folder)
        else:
            import subprocess
            subprocess.Popen(["open" if sys.platform == "darwin" else "xdg-open", str(folder)])

    def choose_folder(self):
        initial = self.source.get() or str(Path.home())
        selected = filedialog.askdirectory(title="NAS上の蔵書フォルダを選択", initialdir=initial)
        if selected:
            self.source.set(selected)
            if not self.nas_root.get().strip():
                self.nas_root.set("/")

    def append(self, text: str):
        self.output.configure(state="normal")
        self.output.insert("end", text + "\n")
        self.output.see("end")
        self.output.configure(state="disabled")

    def load_config(self):
        try:
            data = json.loads(CONFIG.read_text("utf-8"))
            self.source.set(data.get("source", ""))
            self.nas_root.set(data.get("nas_root", ""))
        except Exception:
            pass

    def save_config(self):
        try:
            APP_DIR.mkdir(parents=True, exist_ok=True)
            CONFIG.write_text(json.dumps({"source": self.source.get(), "nas_root": self.nas_root.get()}, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

    def start(self):
        source = Path(self.source.get().strip())
        nas_root = self.nas_root.get().strip()
        if not source.is_dir():
            messagebox.showerror(APP_NAME, "PC上の蔵書フォルダを選択してください。")
            return
        if not nas_root.startswith("/"):
            messagebox.showerror(APP_NAME, "DSMパスは /8Books/… のように先頭を / にしてください。")
            return
        if self.running:
            return
        self.save_config()
        self.running = True
        self.run_button.configure(state="disabled")
        self.progress.start(12)
        self.status.set("フォルダを確認しています…")
        self.append(f"対象: {source}  →  DSM {nas_root}")
        threading.Thread(target=self.worker, args=(source, nas_root), daemon=True).start()

    def worker(self, source: Path, nas_root: str):
        try:
            last = {"n": 0}
            def progress(count, path):
                self.events.put(("progress", count, path.name))
            def log(message):
                self.events.put(("log", message))
            result = generate_cache(source, nas_root, progress=progress, log=log)
            self.events.put(("done", result))
        except Exception as exc:
            self.events.put(("error", str(exc)))

    def poll_events(self):
        try:
            while True:
                item = self.events.get_nowait()
                if item[0] == "progress":
                    self.status.set(f"{item[1]}冊目: {item[2]}")
                    if item[1] == 1 or item[1] % 50 == 0:
                        self.append(self.status.get())
                elif item[0] == "log":
                    self.append(item[1])
                elif item[0] == "done":
                    result = item[1]
                    self.running = False
                    self.progress.stop()
                    self.run_button.configure(state="normal")
                    self.status.set("完了" if not result["errors"] else "一部失敗")
                    summary = f"{result['scanned']}冊を確認しました。\n新規・更新: {result['generated']}枚\n変更なし: {result['reused']}冊\n表紙なし: {result['no_cover']}冊"
                    if result["errors"]:
                        summary += f"\n失敗: {len(result['errors'])}件（詳細は処理状況を確認してください）"
                    messagebox.showinfo(APP_NAME, summary)
                elif item[0] == "error":
                    self.running = False
                    self.progress.stop()
                    self.run_button.configure(state="normal")
                    self.status.set("エラー")
                    self.append("エラー: " + item[1])
                    messagebox.showerror(APP_NAME, item[1])
        except queue.Empty:
            pass
        self.root.after(100, self.poll_events)


def main():
    root = tk.Tk()
    ThumbnailApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
