import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.meta = {}
        self.links = []
        self.schemas = []
        self.headings = 0
        self.title = ""
        self.text = ""
        self.schema_text = None
        self.in_title = False
        self.feed(Path(path).read_text())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta[attrs.get("name", attrs.get("property"))] = attrs.get("content")
        if tag == "link" or tag == "a":
            self.links.append(attrs)
        if tag == "h1":
            self.headings += 1
        if tag == "title":
            self.in_title = True
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.schema_text = ""

    def handle_data(self, data):
        self.text += data
        if self.in_title:
            self.title += data
        if self.schema_text is not None:
            self.schema_text += data

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "script" and self.schema_text is not None:
            schema = json.loads(self.schema_text)
            self.schemas.extend(schema if isinstance(schema, list) else [schema])
            self.schema_text = None


class SEOTests(unittest.TestCase):
    def test_homepage_identity(self):
        page = Page("dist/index.html")
        self.assertEqual(page.title, "Yanouk — Software Developer in Cambodia")
        self.assertIn("Phnom Penh", page.meta["description"])
        self.assertIn("I build open-source", page.text)
        self.assertEqual(page.meta["author"], "Yanouk")
        self.assertEqual(page.headings, 1)
        profiles = [schema for schema in page.schemas if schema["@type"] == "ProfilePage"]
        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0]["mainEntity"]["name"], "Yanouk")
        self.assertEqual(profiles[0]["mainEntity"]["@type"], "Person")
        urls = [link.get("href") for link in page.links]
        self.assertNotIn("https://x.com/", urls)
        self.assertNotIn("https://t.me/", urls)

    def test_article_schema_and_headings(self):
        page = Page("dist/blog/gdsf/index.html")
        self.assertEqual(page.headings, 1)
        self.assertEqual(page.meta["og:type"], "article")
        article = next(schema for schema in page.schemas if schema["@type"] == "BlogPosting")
        self.assertEqual(article["author"]["name"], "Yanouk")
        self.assertEqual(article["headline"], "How to Download a Folder from GitHub Without Cloning the Repository")
        self.assertEqual(article["datePublished"], page.meta["article:published_time"])
        self.assertEqual(article["mainEntityOfPage"], "https://pages.yanouk.dev/blog/gdsf/")
        self.assertTrue(article["image"].startswith("https://pages.yanouk.dev/og/"))
        self.assertIn("/project/gdsf/", [link.get("href") for link in page.links])

    def test_breadcrumbs_match_visible_links(self):
        for path in list(Path("dist/blog").glob("*/index.html")) + list(Path("dist/project").glob("*/index.html")):
            with self.subTest(path=path):
                page = Page(path)
                schema = next(schema for schema in page.schemas if schema["@type"] == "BreadcrumbList")
                items = schema["itemListElement"]
                self.assertEqual([item["position"] for item in items], [1, 2, 3])
                self.assertIn(items[-1]["name"], page.text)
                self.assertIn("/", [link.get("href") for link in page.links])

    def test_sitemap_and_canonicals(self):
        root = ElementTree.parse("dist/sitemap-0.xml")
        urls = [element.text for element in root.findall(".//{*}loc")]
        self.assertNotIn("https://pages.yanouk.dev/resume/", urls)
        self.assertNotIn("https://pages.yanouk.dev/blog/markdown-showcase/", urls)
        self.assertIn("https://pages.yanouk.dev/blog/gdsf/", urls)
        for url in urls:
            with self.subTest(url=url):
                relative = url.removeprefix("https://pages.yanouk.dev/")
                page = Page(Path("dist") / relative / "index.html")
                canonical = [link["href"] for link in page.links if link.get("rel") == "canonical"]
                self.assertEqual(canonical, [url])
                self.assertEqual(page.meta["og:url"], url)
                self.assertTrue(page.meta["description"])
                self.assertEqual(page.meta["og:title"], page.title)

    def test_demo_and_error_pages_are_not_indexable(self):
        self.assertFalse(Path("dist/blog/markdown-showcase/index.html").exists())
        self.assertFalse(Path("dist/og/blog/markdown-showcase.png").exists())
        for path in ["dist/resume/index.html", "dist/404.html"]:
            self.assertEqual(Page(path).meta["robots"], "noindex, follow")
            self.assertIn("data-pagefind-ignore=\"all\"", Path(path).read_text())

    def test_rss_branding_and_published_content(self):
        channel = ElementTree.parse("dist/rss.xml").getroot().find("channel")
        self.assertEqual(channel.findtext("title"), "Yanouk's Blog")
        links = [item.findtext("link") for item in channel.findall("item")]
        self.assertEqual(links, ["https://pages.yanouk.dev/blog/gdsf/"])


if __name__ == "__main__":
    unittest.main()
