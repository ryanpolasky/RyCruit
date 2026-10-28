# Islands themes

Colors are taken from JetBrains' `intellij-community` sources (master, retrieved 2026-10-28), not sampled from screenshots. Upstream source files are Apache-2.0 licensed.

Base URL: https://raw.githubusercontent.com/JetBrains/intellij-community/master/platform/platform-resources/src/

- `themes/islands/ManyIslandsDark.theme.json`: Islands Dark UI semantic tokens. Frame `main-window-bg` resolves to `#26282C`; editor/tool window `#191A1C`; text `#D1D3D9`; brand accent `#3871E1`.
- `themes/islands/ManyIslandsLight.theme.json`: Islands Light UI tokens. Frame `#E9EAEE`; islands `#FFFFFF`; text `#000000`; brand accent `#3871E1`. Its editor scheme is `Light`.
- `themes/islands/IslandSchemeDark.xml`: actual Islands Dark editor scheme. Editor `#191A1C`, text `#BCBEC4`, caret `#CED0D6`, current line `#1F2024`, gutter numbers `#4B5059`; keyword `#CF8E6D`, string `#6AAB73`, number `#2AACB8`, comment `#7A7E85`, function declaration `#56A8F5`, method call `#57AAF7`.
- `themes/expUI/expUI_darkScheme.xml`: checked against the New UI Dark editor scheme. Syntax colors match Islands Dark; Islands overrides editor background/current-line colors.
- `themes/expUI/expUI_lightScheme.xml`: Light editor scheme. Editor `#FFFFFF`, text `#080808`, current line `#F5F8FE`, selection `#A6D2FF`, gutter numbers `#AEB3C2`; keyword `#0033B3`, string `#067D17`, number `#1750EB`, italic comment `#8C8C8C`, function declaration `#00627A`.
- `DefaultColorSchemesManager.xml`: inherited Default/Darcula values. Dark selection `#214283`; Light caret `#000000`. Class/type names and Light instance method calls inherit editor text; they do not receive an invented syntax accent. CodeMirror provides lexical rather than IDE semantic highlighting, so static and instance calls cannot reliably be distinguished.

The web layout adapts Islands' frame/island separation and tool-window tabs to a collaborative pad; it is not an IntelliJ UI port. Fonts are locally served from `@fontsource/inter` and `@fontsource/jetbrains-mono`. Cursor colors are a separate collaborative palette chosen to remain visible on either editor background; cursor labels are white on solid colors.

The header sun/moon button changes only this browser's `rycruit.theme` preference. Without a saved preference the initial theme follows `prefers-color-scheme`. Themes never enter the shared Y.Doc.

## Run green brand

The green play mark, bold Ry and regular Cruit wordmark are shared by the SPA and server-rendered pages. Islands frame, editor selection and syntax colors stay unchanged. Active tabs, focus rings, primary buttons and native controls use the green brand palette.

Run green comes from `ManyIslandsDark.theme.json`'s `icon-green-stroke` → `green-90` (`#4E9D6C`) and `ManyIslandsLight.theme.json`'s `icon-green-stroke` → `green-80` (`#338555`). Dark's `runIconColor` points to that icon token. Green buttons use dark ink in Dark and white ink in Light for text contrast.

Primary-button text exceeds 4.5:1 contrast in both themes, including hover states. Small accent text uses `#6DB083` in Dark and `#2A6E47` in Light for readable links on the frame and islands. Favicons follow the saved theme, falling back to the system preference.
