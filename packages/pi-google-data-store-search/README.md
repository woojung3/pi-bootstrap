# pi-google-data-store-search

Pi extension package that registers `google_data_store_search`, a custom tool for searching configured Google Gemini Enterprise / Vertex AI Search / Agent Search **Data Store** sources.

The tool searches **one selected source per call**. For example, if the user asks to search Confluence, the model should pass `source: "confluence"`; if the user asks to search SharePoint, it should pass `source: "sharepoint"`.

## Installation

From this repository:

```bash
pi install ./packages/pi-google-data-store-search
```

Project-local install:

```bash
pi install -l ./packages/pi-google-data-store-search
```

If the whole `pi-bootstrap` repository is installed as a git package, the root `package.json` also loads this extension.

## Authentication

Use Google Application Default Credentials:

```bash
gcloud auth application-default login
gcloud config set project acme-gemini-enterprise-123456
```

Or use a service account key outside the repository:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcloud/acme-search-service-account.json"
```

Required permission for the authenticated identity:

```text
discoveryengine.servingConfigs.search
```

`roles/discoveryengine.viewer` is often sufficient, but a custom least-privilege role is preferable when possible.

## Configuration

### Global Google settings

```bash
export GOOGLE_CLOUD_PROJECT="acme-gemini-enterprise-123456"
export GOOGLE_CLOUD_LOCATION="global"
export GOOGLE_DATA_STORE_COLLECTION="default_collection"
export GOOGLE_DATA_STORE_SERVING_CONFIG="default_config"
export GOOGLE_DATA_STORE_PAGE_SIZE="5"
```

What these values mean:

| Variable | Example | Notes |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | `acme-gemini-enterprise-123456` | Google Cloud project **ID** containing the Data Store. |
| `GOOGLE_CLOUD_LOCATION` | `global` | Most Gemini Enterprise / Agent Builder Data Stores use `global`. |
| `GOOGLE_DATA_STORE_COLLECTION` | `default_collection` | Google commonly creates connector Data Stores under `default_collection`. |
| `GOOGLE_DATA_STORE_SERVING_CONFIG` | `default_config` | Default Discovery Engine serving config name. |
| `GOOGLE_DATA_STORE_PAGE_SIZE` | `5` | Default number of results, clamped to 1-20. |

`default_collection` and `default_config` are intentionally shown as real-looking defaults because they are commonly the actual values.

### Source catalog

Configure searchable sources using a private JSON file:

```bash
mkdir -p "$HOME/.config/pi"
cp packages/pi-google-data-store-search/google-data-store-sources.example.json \
  "$HOME/.config/pi/google-data-store-sources.json"

# Optional: the extension auto-detects this default path.
# Export this only if you store the file somewhere else.
export GOOGLE_DATA_STORE_SOURCES_FILE="$HOME/.config/pi/google-data-store-sources.json"
```

The extension automatically reads this default file when it exists:

```text
~/.config/pi/google-data-store-sources.json
```

Edit the private file with your real Data Store IDs and optional Confluence/SharePoint scope restrictions:

```json
[
  {
    "name": "confluence-cam-pages",
    "aliases": ["confluence", "wiki", "cam-wiki"],
    "dataStoreId": "acme-confluence-connector_1234567890123_page",
    "confluenceSpaceKey": "CAM",
    "description": "Confluence CAM space pages"
  },
  {
    "name": "sharepoint-cam-files",
    "aliases": ["sharepoint", "office-docs", "documents"],
    "dataStoreId": "acme-sharepoint-connector_9876543210987_file",
    "sharepointSiteId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "description": "SharePoint CAM site document library files"
  }
]
```

Do **not** commit the private file if it contains real company project names, connector names, or Data Store IDs.

You can also configure the same JSON directly in an environment variable:

```bash
export GOOGLE_DATA_STORE_SOURCES='[
  {
    "name": "confluence-cam-pages",
    "aliases": ["confluence", "wiki"],
    "dataStoreId": "acme-confluence-connector_1234567890123_page",
    "confluenceSpaceKey": "CAM"
  },
  {
    "name": "sharepoint-cam-files",
    "aliases": ["sharepoint", "documents"],
    "dataStoreId": "acme-sharepoint-connector_9876543210987_file",
    "sharepointSiteId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
  }
]'
```

### Per-source overrides

Each source can override global settings:

```json
{
  "name": "europe-sharepoint-files",
  "aliases": ["sharepoint-eu", "eu-docs"],
  "project": "acme-eu-search-654321",
  "location": "global",
  "collection": "default_collection",
  "dataStoreId": "acme-eu-sharepoint-connector_4567890123456_file",
  "servingConfig": "default_config",
  "sharepointSiteId": "ffffffff-1111-2222-3333-444444444444",
  "filter": "language: ANY(\"en\")",
  "description": "EU SharePoint document library files"
}
```

### Limiting search to a Confluence space or SharePoint site

For common Confluence/SharePoint subsets, prefer these convenience fields over hand-written filters:

```json
{
  "name": "confluence-security-space",
  "aliases": ["security-wiki", "보안스페이스"],
  "dataStoreId": "acme-confluence-connector_1234567890123_page",
  "confluenceSpaceKey": "SEC",
  "description": "Confluence Security space pages"
}
```

```json
{
  "name": "sharepoint-cam-files",
  "aliases": ["cam-sharepoint", "cam-docs"],
  "dataStoreId": "acme-sharepoint-connector_9876543210987_file",
  "sharepointSiteId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "description": "SharePoint CAM site files"
}
```

The extension converts these fields into Discovery Engine filters:

| Convenience field | Generated filter |
|---|---|
| `confluenceSpaceKey` | `space.key: ANY("...")` |
| `confluenceSpaceName` | `space.name: ANY("...")` |
| `sharepointSiteId` | `parentReference.siteId: ANY("...")` |
| `sharepointSiteName` | `SiteName: ANY("...")` |

For SharePoint **file** Data Stores, `sharepointSiteId` is usually more reliable than site URL text. For SharePoint **page** Data Stores, `sharepointSiteName` may be useful if the page Data Store contains indexed site pages.

Supported fields:

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Stable source name shown in results and accepted by the tool. |
| `dataStoreId` | yes | Discovery Engine Data Store ID. |
| `aliases` | no | Natural names the model/user may use, such as `confluence` or `sharepoint`. |
| `description` | no | Human-readable explanation. |
| `project` | no | Overrides `GOOGLE_CLOUD_PROJECT`. |
| `location` | no | Overrides `GOOGLE_CLOUD_LOCATION`. |
| `collection` | no | Overrides `GOOGLE_DATA_STORE_COLLECTION`. |
| `servingConfig` | no | Overrides `GOOGLE_DATA_STORE_SERVING_CONFIG`. |
| `confluenceSpaceKey` | no | Restrict Confluence results to a space key, e.g. `SEC` or `CAM`. |
| `confluenceSpaceName` | no | Restrict Confluence results to a space name. |
| `sharepointSiteId` | no | Restrict SharePoint file/attachment results to a site ID. |
| `sharepointSiteName` | no | Restrict SharePoint page results to a site name. |
| `filter` | no | Additional source-specific Discovery Engine filter. Combined with convenience filters using `AND`. |

## Connector Data Store ID examples

Google enterprise connectors often split one connector into multiple physical Data Stores by content type.

Confluence examples:

```text
acme-confluence-connector_1234567890123_page
acme-confluence-connector_1234567890123_attachment
acme-confluence-connector_1234567890123_blog
```

SharePoint examples:

```text
acme-sharepoint-connector_9876543210987_file
acme-sharepoint-connector_9876543210987_page
```

If search returns `DataStore ... not found`, check whether the suffix such as `_page`, `_attachment`, or `_file` is missing.

## Usage

Ask naturally:

```text
confluence에서 외부 저장소 사용 규정을 찾아줘
```

```text
sharepoint에서 계약서 양식을 검색해줘
```

The model should call the tool with one selected source:

```json
{
  "query": "외부 저장소 사용 규정",
  "source": "confluence",
  "pageSize": 5
}
```

```json
{
  "query": "계약서 양식",
  "source": "sharepoint",
  "pageSize": 5
}
```

If `source` is omitted and multiple sources are configured, the tool only guesses from exact aliases in the query. If the source is still ambiguous, it fails and prints the available sources instead of silently searching the wrong Data Store.

## Legacy single-source mode

For a quick single Data Store setup, you may use the old single-source variable:

```bash
export GOOGLE_CLOUD_PROJECT="acme-gemini-enterprise-123456"
export GOOGLE_DATA_STORE_ID="acme-confluence-connector_1234567890123_page"
export GOOGLE_DATA_STORE_SOURCE="confluence-pages"
```

This is convenient for testing, but the source catalog is recommended for Confluence/SharePoint selection.

## Security notes

- This package does not call the Gemini Enterprise web app UI.
- It calls the Discovery Engine Search REST API for the configured Data Store.
- Keep real project IDs, connector IDs, service account keys, and filters out of public repositories.
- Extensions run with the permissions of the `pi` process. Review packages before installing them.
