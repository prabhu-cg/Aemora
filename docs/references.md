# References: what each AEM decision rests on

Aemora writes Granite UI dialogs, HTL, Sling Models and component definitions for AEM as a Cloud Service. This page lists the public documentation behind each choice, and says plainly how much of it was actually confirmed.

**Checked on 2026-11-11**, by reading the pages named below and by searching for the rest. Nothing here was run on a real AEM instance. See [verifying-on-aem.md](verifying-on-aem.md) for how to do that.

## How to read the status

| Status | Meaning |
|---|---|
| **Documented** | A page of official documentation (Adobe, Apache Sling or the HTL specification) says it. |
| **Community** | Seen in forum answers or blog posts, several of them agreeing, but no official page was found. |
| **Not verified** | Used by Aemora, but no source was found or read. Treat it as a guess until checked. |

The Granite UI pages checked are the **AEM 6.5** reference. The Cloud Service reference was not read separately. Granite UI is the same library, but a property can differ between versions.

## Sources

- **Granite UI reference** (AEM 6.5 API documentation): `https://experienceleague.adobe.com/en/tools/aem-api-documentation/6-5/granite-ui/api/jcr_root/libs/granite/ui/components/coral/foundation/…` with one page per component.
- **Apache Sling, Sling Models:** https://sling.apache.org/documentation/bundles/models.html
- **Apache Sling API docs, `@Default`:** https://sling.apache.org/apidocs/sling13/org/apache/sling/models/annotations/Default.html
- **Apache Sling POST servlet:** https://sling.apache.org/documentation/bundles/manipulating-content-the-slingpostservlet-servlets-post.html
- **HTL specification 1.4:** https://github.com/adobe/htl-spec/blob/1.4/SPECIFICATION.md
- **AEM components, the basics** (6.5): https://experienceleague.adobe.com/en/docs/experience-manager-65/content/implementing/developing/components/components-basics
- **AEM project structure** (Cloud Service): https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/aem-project-content-package-structure (found, not read)
- **WCM Core Components** (the reference dialogs to copy from): https://github.com/adobe/aem-core-wcm-components (not read)

## Dialog structure

| Piece | Resource type Aemora writes | Status | Notes |
|---|---|---|---|
| Dialog root | `cq/gui/components/authoring/dialog` | Not verified | Adobe's components page says a touch dialog is a `cq:dialog` node that is `nt:unstructured` and uses Granite UI. It does not name this resource type. |
| Tabs | `granite/ui/components/coral/foundation/tabs` | Documented | Tabs are children of an `items` node, each a container with a `jcr:title`. The first tab is active unless one sets `active`. |
| Tab body | `granite/ui/components/coral/foundation/container` | Documented | This is the resource type the tabs page uses for a tab. What goes inside it was not on the page. |
| Columns | `granite/ui/components/coral/foundation/fixedcolumns` | Documented | A container that renders each item as a fixed-width column. The separate `layouts/fixedcolumns` type Aemora also writes is **not mentioned** on that page. |
| Section | `granite/ui/components/coral/foundation/form/fieldset` | Not verified | |

## Field types

All the Granite pages below are the 6.5 reference, `…/coral/foundation/form/<name>`.

| Field | Resource type | Status | What was confirmed, and what was not |
|---|---|---|---|
| Textfield | `…/form/textfield` | Documented | `name`, `value`, `emptyText`, `maxlength`, `required` are listed. `fieldLabel` and `fieldDescription` are not on this page. |
| Textarea | `…/form/textarea` | Documented | `name`, `value`, `emptyText`, `maxlength`, `rows` (default 5), `cols`. |
| Numberfield | `…/form/numberfield` | Documented | `min`, `max`, `step` (default 1), `typeHint`, `value`. `typeHint` is described as the `@TypeHint` value and as generating a matching hidden input. |
| Checkbox | `…/form/checkbox` | Documented | `name`, `text`, `value`, `uncheckedValue`, `checked`, `fieldDescription`, `required`. **There is no `typeHint` property**, which is why Aemora adds a separate hidden `@TypeHint` field next to it (see below). |
| Switch | `…/form/switch` | Documented | `name`, `value`, `uncheckedValue`, `checked`. `text` and `typeHint` are not listed. Aemora writes `text` and a hidden hint as it does for the checkbox. |
| Select | `…/form/select` | Documented | `name`, `multiple`, `emptyOption`. Options are child nodes with `value`, `text` and `selected`. |
| Multifield | `…/form/multifield` | Documented | `composite`, a `field` subnode, `typeHint`, `deleteHint`. A composite field stores each entry as a child node `item0`, `item1` and so on. A simple field stores one multi-value property. |
| Pathfield | `…/form/pathfield` | Documented | `rootPath` (default `/`), `multiple`, `emptyText`, `filter`, `forceSelection`. |
| Datepicker | `…/form/datepicker` | Documented | `type` is `date`, `datetime` or `time`. `displayedFormat`, `valueFormat` (default `YYYY-MM-DD[T]HH:mm:ss.SSSZ`), and `typeHint` (default `Date`). The page does not name the format syntax. The formats Aemora chooses are its own and are not tested. |
| Colorfield | `…/form/colorfield` | Documented | `name`, `value`, `showDefaultColors`, `showProperties`, `showSwatches`. |
| Hidden | `…/form/hidden` | Not verified | |
| File upload | `cq/gui/components/authoring/dialog/fileupload` | Community | This is **not** the Granite file upload. The Granite page (`granite:FormFileUpload`) documents `name`, `uploadUrl`, `mimeTypes`, `multiple`, `autoStart`, and does not list `fileNameParameter`, `fileReferenceParameter`, `useHTML5` or `class`. Several forum examples use the authoring type with `class="cq-droptarget"`, `fileNameParameter`, `fileReferenceParameter`, `mimeTypes`, `multiple` and `useHTML5`. Aemora's `uploadUrl` and `title` values were not found in any source. The WCM Core Components image dialog is the reference to copy from. |
| Tag field | `cq/gui/components/coral/common/form/tagfield` | Community | Forum posts use it with a `rootPath` such as `/content/cq:tags/…`. No official page was found. Posts report that tags created from the dialog land in the default namespace, outside `rootPath`. |
| Rich text | `cq/gui/components/authoring/dialog/richtext` | Community | Reported by Adobe's rich text editor page and forum answers: in a touch dialog, `useFixedInlineToolbar` should be `true`. Aemora sets only that and no `rtePlugins`. Which plugins are on without `rtePlugins` was not confirmed. The RTE page was seen in search results but not opened. |

## Saving typed values: `@TypeHint`

The Sling POST servlet stores form values as strings unless told otherwise. A parameter named `<name>@TypeHint` carries the JCR type of the property `<name>`.

- **Documented:** the hint is a parameter with the `@TypeHint` suffix, and its value "is the JCR property type name". The page shows `Long`, `Boolean` and `String[]`, and says "All types should be supported". A value ending in `[]` marks a multi-value property, and with a single value that is required.
- **Documented:** dates are parsed with the patterns in `servlet.post.dateFormats`. Only `ISO8601` keeps the time zone. The first pattern that parses wins, so the order matters.
- **Aemora writes** `Long` or `Double` for number fields, `Boolean` for checkbox and switch, and `Date` for date pickers. `Double` and `Date` are not named on the page, only covered by "all types". Whether `YYYY-MM-DD` values parse into a `Date` depends on the server's `dateFormats` configuration, so it is on the list to check.
- **Community:** for a checkbox, a pair of nodes (the checkbox plus a hidden field named `./name@TypeHint` set to `Boolean`) is the usual way to get a real Boolean. Forum answers also report that `uncheckedValue` behaves differently in the foundation and coral checkbox types, and that it needs testing on your version.

## Show and hide

Aemora marks the controlling field and the controlled field with Granite markers: `granite:class` values `cq-dialog-checkbox-showhide` or `cq-dialog-dropdown-showhide`, a `granite:data` child pointing at a target class, `hide` and the target class on the controlled field, and `showhidetargetvalue` for a select.

- **Community:** the dropdown pattern (a class on the select, a `granite:data` child with a `…-showhide-target` selector, the target class on the fields) is described the same way by several posts. For checkboxes the sources **disagree** on the exact class and attribute names. Forum posts also report that dropdown and checkbox handling worked differently on some versions.
- **No official page was found** for either.
- **Why this is still safe to ship:** the export includes its own small clientlib (`clientlib-dialog-showhide`, category `cq.authoring.dialog`) that reads exactly the markers Aemora writes. The behaviour does not depend on a handler built into AEM.
- **To check on an instance:** that AEM's own handling of the same class names does not also act on the fields, which would toggle them twice.

## Sling Model

Aemora writes `@Model(adaptables = Resource.class, defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL)`, fields injected with `@ValueMapValue`, and `@Default` where a property has a default.

- **Documented:** the Sling Models page advises sticking to `Resource` as the adaptable. It says `@Inject` is discouraged in favour of injector-specific annotations, and shows `@ValueMapValue` for properties of the resource. `defaultInjectionStrategy = OPTIONAL` is documented, and an optional injection that fails leaves the field at its default.
- **Documented:** `@Default(values = …)` for strings and primitives. The Javadoc lists `booleanValues` and `doubleValues` (arrays) among the elements. The prose for them was not read.
- **Community and bug tracker:** older issues report that defaults for boolean wrapper types were ignored, fixed in Sling Models Implementation 1.0.2 and 1.0.4. Aemora uses the primitive `boolean`.
- **Not verified:** the Java types Aemora picks for dates (`Calendar`) and for lists and tags (`String[]`) when read from a value map.
- **Not shown by the pages read:** using a Sling Model from HTL with `data-sly-use`. The Sling Models page points to a separate page for it. The combination is the common practice but was not confirmed from these sources.

## HTL

- **Documented:** `data-sly-use.name="…"` makes the logic available as `name` (§2.2.1). `data-sly-test` removes the element when the value is false, and the falsy values are `false`, `0`, the empty string and an empty list (§2.2.5). The string `"false"` is truthy. `context='html'` strips markup that may carry XSS (§1.2.1). The `<sly>` element removes itself and keeps its children (§3.1). Expressions in `href` and `src` use the URI context by default.
- **Consequence for the output:** a number field that is `0` hides its element with `data-sly-test`, because `0` is falsy. Aemora's markup tests text and layer visibility this way and does not rely on numbers.
- **Naming:** BEM-style `cmp-<name>__<element>` classes follow the Core Components convention. This is a convention, not a rule from the specification.

## Component definition and package layout

- **Documented:** a component is a `cq:Component` node. `jcr:title` is its name, and `componentGroup` sets where it appears in the components browser. Edit behaviour comes from a child node of type `cq:EditConfig`. The touch dialog is a `cq:dialog` node.
- **Not verified:** the property `cq:actions="[edit,delete,insert]"` that Aemora writes in `_cq_editConfig.xml`. The page says an edit config controls actions but not how it is written.
- **Community:** `_cq_dialog/.content.xml` and `_cq_dialog.xml` are both valid serializations of the dialog node, and the folder form is fine. `_cq_editConfig.xml` is the usual name for the edit config. An Adobe knowledge-base article confirms that a Cloud Manager deployment fails when a dialog's `.content.xml` is not valid XML, which is what Aemora's three checks guard against.
- **Gap, found while writing this:** Aemora's edit config has **no `cq:dropTargets`**. Forum answers say drag and drop of an asset onto a component needs that node (copied from a Core Components dialog). Dragging an image from the asset finder onto a generated component will not work until it is added.

## Parked for a later release

### Dropping an asset onto the component in the page editor

**What it is.** In AEM's page editor an author can drag an image from the Assets panel and drop it onto a component on the page, and it fills the component's image field without opening the dialog. This has nothing to do with ordering fields in Aemora's Dialog tab, which already works.

**Why it does not work today.** AEM only accepts the drop if the component declares it, with a `cq:dropTargets` node in the edit config. Aemora's `_cq_editConfig.xml` holds only `cq:actions="[edit,delete,insert]"`, so authors open the dialog and use the upload field instead.

**Why it is parked.**
- It matters only for components with a file upload field.
- The node structure was not confirmed from a source. It is believed to be a `cq:dropTargets` node whose child is of type `cq:DropTargetConfig`, with properties for the accepted file types and the property the asset path is written to. Forum answers say to copy it from the WCM Core Components image dialog, and none gives a specification.
- The generator would need to know which field receives the asset, and it does not yet link a design layer to a field.

**What to do when it is picked up.**
1. Copy the exact structure from the Core Components image component, and link that file here.
2. Generate it only for a component with a file upload field, pointing at that field's file reference property.
3. Keep it marked **Not verified** until it has been tried on an instance.
4. Check that the generated `_cq_editConfig.xml` still passes Aemora's checks and imports on Cloud Manager.

## What to do next

In rough order of risk:

1. Run the dialogs on a development instance ([verifying-on-aem.md](verifying-on-aem.md)).
2. Check the file upload, tag field and rich text dialogs against the WCM Core Components versions.
3. Check the Cloud Service Granite UI reference for the properties above, since the pages read here are 6.5.
4. Pick up the parked drop-target work above.
5. Replace each **Community** or **Not verified** line with a link as soon as a source is found.

## Keeping this page honest

When the code changes what it emits, change the row here in the same commit. A line may move from **Not verified** to **Documented** only when a page has been opened and the property found on it.
