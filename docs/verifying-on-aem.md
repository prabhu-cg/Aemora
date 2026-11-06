# Verifying generated dialogs on AEM as a Cloud Service

Aemora's checks are static. They confirm the XML is well-formed and follows the Granite UI structure Aemora knows. Only a real environment can confirm a dialog opens, renders and saves. This is the short procedure, and what to write down.

You need a **development** AEM as a Cloud Service environment (or a local SDK) and an AEM project with a `ui.apps` module.

## Steps

1. In Aemora, open the project and use **Export → Download all as ZIP** (or **Download XML** for one dialog).
2. Unzip. Merge `jcr_root/` into `ui.apps/src/main/content/` in your project. The README in the ZIP lists where each dialog lands. Dialogs that already exist are replaced: compare first.
3. Make sure the component folder also has its component definition (`.content.xml` with `jcr:title`, `componentGroup`) and an HTL script. Aemora generates only the dialog.
4. Build and deploy `ui.apps` to the development environment.
5. Open a page in the editor, add the component, and open its dialog.

## What to check, per dialog

| Check | What to look for |
|---|---|
| Opens | The dialog opens without an error toast, and the title matches |
| Tabs and sections | Same tabs, same order, sections show as titled groups |
| Each field renders | Right control for each field type; labels; required markers |
| Defaults | Defaults appear on a **new** component |
| Description | The (?) tooltip shows the description |
| Select | All choices present; default selected; empty choice only when optional |
| Multifield | Add, remove, reorder; composite items show all named fields |
| Pathfield and file upload | The picker opens at the right root path; a chosen asset is kept |
| Validation | Required fields block Done; number limits and maximum length are enforced |
| Save | Click Done, then reopen: values persist |
| Stored values | In CRXDE (`/content/.../jcr:content/...`) the properties have the expected names **and types** (Boolean, Long, Date, String[]) |

The last row matters most: it is where the `@TypeHint` siblings, `typeHint` settings and date formats are proved or disproved.

## Things Aemora is not sure about

These are written from knowledge of Granite UI and the Core Components, not from a run on AEM. Watch them first:

- Checkbox and switch: a hidden `./name@TypeHint` sibling stores the value as a Boolean.
- Datepicker: standard formats for `date` and `datetime`.
- Fileupload: parameter names derived from the field name (`./fieldFileName`, `./fieldFileReference`).
- Richtext: only `useFixedInlineToolbar` is set; no `rtePlugins` configuration.
- Tag field: `rootPath` `/content/cq:tags`.
- Conditional fields ("Show only when"): written with the conventional Granite show/hide markers. The controller gets `granite:class="cq-dialog-checkbox-showhide"` (checkbox, switch) or `"cq-dialog-dropdown-showhide"` (select) and a `granite:data` child pointing at a CSS class; the conditional field gets `granite:class="hide <that class>"` and, for a select, `showhidetargetvalue`. A script must read these. The export ZIP includes one (`clientlibs/clientlib-dialog-showhide`, category `cq.authoring.dialog`, `allowProxy`), added only when a dialog uses these markers. Check on your instance that it loads in the dialog, that the checkbox and the switch both toggle the fields, that the select values show the right fields, and that a hidden required field does not block saving. Fields hidden this way are still submitted with the dialog.

## Recording the result

Note the AEM version or SDK, which dialogs you tried, and anything that differed. If something is wrong, the fix is usually one attribute in `src/features/mapping/nodes.ts`, and the golden tests in `src/features/xml/xml.test.ts` show what to update. Please report differences so the output can be corrected and the "not yet tested" notices can be removed.
