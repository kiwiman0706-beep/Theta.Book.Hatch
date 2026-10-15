import sys, tempfile, unittest, json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from dsbooks_metadata import MetadataIndex, series_guess
class MetadataTest(unittest.TestCase):
 def test_roundtrip_rename_copy(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp).resolve();cache=root/'_DSBooksCache';p=root/'漫画 01.epub';p.write_bytes(b'sample epub bytes')
   def scan(path,prior):
    r={'path':'/Books/'+path.name,'size':path.stat().st_size}
    return MetadataIndex(root,'/Books',cache,{'books':prior}).enrich(path,r)
   a=scan(p,[]);self.assertEqual(a['series'],'漫画');self.assertEqual(a['volume'],'01')
   note=cache/a['metadata'];s=note.read_text();s=s.replace('tags: []','tags:\n- お気に入り').replace('series: 漫画','series: 編集シリーズ')+'\n自分のメモ\n';note.write_text(s)
   b=scan(p,[a]);self.assertEqual(a['bookId'],b['bookId']);self.assertEqual(b['tags'],['お気に入り']);self.assertEqual(b['series'],'編集シリーズ');self.assertIn('自分のメモ',note.read_text())
   q=root/'改名.epub';p.rename(q);c=scan(q,[b]);self.assertEqual(c['bookId'],a['bookId']);self.assertIn(a['path'],c['previousPaths']);self.assertEqual(c['contentHash'],a['contentHash'])
   copy=root/'コピー.epub';copy.write_bytes(q.read_bytes());d=scan(copy,[c]);self.assertNotEqual(d['bookId'],c['bookId'])
   e=scan(q,[c,d]);self.assertEqual(e['metaUpdatedAt'],c['metaUpdatedAt']);self.assertEqual(e['bookId'],c['bookId'])
 def test_guess(self):
  self.assertEqual(series_guess('[12巻]宇宙'),('宇宙','12'))
  self.assertEqual(series_guess('小説 第3巻'),('小説','3'))
  self.assertEqual(series_guess('単巻'),('',''))
if __name__=='__main__':unittest.main()
