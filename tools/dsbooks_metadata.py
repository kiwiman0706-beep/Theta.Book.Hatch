"""Stable IDs and editable Obsidian frontmatter. Original book bytes are never modified."""
from __future__ import annotations
import hashlib
import json
import re
import time
import uuid
from pathlib import Path
import yaml


def content_hash(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def series_guess(title):
    m = re.match(r'^\[(\d+)巻\]\s*(.+)$', title)
    if m:
        return m[2].strip(), m[1]
    m = re.match(r'^(.*?)\s*(?:第\s*)?(\d{1,3})\s*(?:巻|集)\s*$', title)
    if not m:
        m = re.match(r'^(.*?)\s+(\d{1,3})$', title)
    return (m[1].strip(), m[2]) if m and m[1].strip() else ('', '')


class MetadataIndex:
    def __init__(self, source, remote_root, cache, previous):
        self.source, self.remote_root, self.cache = source, remote_root, cache
        self.old = previous.get('books', [])
        self.by_path = {x['path']: x for x in self.old if isinstance(x, dict) and x.get('path')}
        self.claimed = set()

    def enrich(self, path, record):
        old = self.by_path.get(record['path'], {})
        stat = path.stat()
        unchanged = old.get('size') == stat.st_size and old.get('mtimeNs') == stat.st_mtime_ns
        sha = old.get('contentHash') if unchanged else None
        sha = sha or content_hash(path)
        # A byte-identical copy alongside the original is a different entry. Reuse only
        # an unambiguous, missing old path; never silently merge two duplicate copies.
        if not old:
            candidates = []
            for item in self.old:
                if item.get('contentHash') != sha or item.get('bookId') in self.claimed:
                    continue
                rel = item.get('path', '').removeprefix(self.remote_root.rstrip('/') + '/')
                candidate = (self.source / rel).resolve()
                if candidate.is_relative_to(self.source) and not candidate.exists():
                    candidates.append(item)
            if len(candidates) == 1:
                old = candidates[0]
        try:
            book_id = str(uuid.UUID(old.get('bookId', '')))
        except (ValueError, TypeError, AttributeError):
            book_id = str(uuid.uuid4())
        if book_id in self.claimed:
            book_id = str(uuid.uuid4())
        self.claimed.add(book_id)
        previous_paths = list(dict.fromkeys(old.get('previousPaths', []) + ([old['path']] if old.get('path') and old['path'] != record['path'] else [])))
        note = self.cache / 'metadata' / f'{book_id}.md'
        series, volume = series_guess(path.stem)
        props = {'bookId': book_id, 'file': path.relative_to(self.source).as_posix(), 'nasPath': record['path'], 'title': path.stem, 'series': series, 'volume': volume, 'tags': []}
        body = '\n# ' + path.stem + '\n\n本のメモを自由に追記できます。\n'
        if note.exists():
            text = note.read_text('utf-8-sig')
            parts = text.split('---', 2)
            if len(parts) != 3 or parts[0].strip():
                raise ValueError(f'メタデータの先頭にYAMLプロパティがありません: {note.name}')
            edited = yaml.safe_load(parts[1])
            if not isinstance(edited, dict):
                raise ValueError(f'YAMLプロパティが不正です: {note.name}')
            props.update(edited)
            body = parts[2]
        props.update(bookId=book_id, file=path.relative_to(self.source).as_posix(), nasPath=record['path'])
        tags = props.get('tags') or []
        if isinstance(tags, str):
            tags = [x.strip() for x in tags.split(',') if x.strip()]
        if not isinstance(tags, list):
            raise ValueError('tagsはリストにしてください')
        meta = {'title': str(props.get('title') or path.stem), 'series': str(props.get('series') or ''), 'volume': str(props.get('volume') or ''), 'tags': [str(x) for x in tags]}
        record.update(meta, bookId=book_id, contentHash=sha, mtimeNs=stat.st_mtime_ns, previousPaths=previous_paths)
        record['metaUpdatedAt'] = old.get('metaUpdatedAt', 0) if all(old.get(k) == v for k, v in meta.items()) else int(time.time() * 1000)
        text = '---\n' + yaml.safe_dump(props, allow_unicode=True, sort_keys=False) + '---' + body
        note.parent.mkdir(parents=True, exist_ok=True)
        if not note.exists() or note.read_text('utf-8') != text:
            temp = note.with_suffix('.tmp')
            temp.write_text(text, 'utf-8')
            temp.replace(note)
        record['metadata'] = str(note.relative_to(self.cache)).replace('\\', '/')
        return record
