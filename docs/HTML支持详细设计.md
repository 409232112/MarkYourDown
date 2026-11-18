# HTML 导入与 Markdown 只读预览详细设计

版本：1.1 · 日期：2026-11-17 · 状态：待实施

本文定义第一版的产品行为、数据契约、转换规则、保存协议、代码改动和验收标准。所有“必须”均为验收要求；后续能力不得混入第一版交付条件。本文只描述设计，不表示相关能力已经实现。

1.1 修订重点：第15章明确转换模块独立边界、规则注册机制、兼容性判定、降级与失败交互。其结果联合类型替代第5.3节的简单 ConvertOutput；其处理要求补充第6章规则与第10章错误定义。实现时以第15章为最终契约。

## 1. 目标与范围

支持打开本地 `.html` / `.htm`，将静态 HTML 转为 Markdown，在现有编辑区域只读展示。用户另存为 `.md` 成功后，当前标签变成普通可编辑 Markdown 文档。源 HTML 不被修改。

第一版以规范语义 HTML 为支持对象：标题、段落、列表、引用、代码、链接、图片、简单表格。保留文字顺序和语义，不复刻 CSS 视觉效果，不依据字号猜测标题。

不包含：URL 抓取、运行 JavaScript 获取正文、AI 转换、自动正文提取、网站专用适配、任意数学或图形还原、HTML 回写、导入后维持 HTML 与 Markdown 双向同步。默认转换 body 全文，不自动删除导航、页脚和侧栏中的文本。

## 2. 当前代码基础与约束

| 位置 | 当前职责 | 本次处理 |
| --- | --- | --- |
| `internal/services/file_service.go` | 打开、保存、另存为、文件监控 | 识别 HTML，新增导入保存会话 |
| `internal/filesystem/encoding.go` | UTF-8/GBK 解码、UTF-16 明确拒绝 | 保留 Markdown 行为，增加独立 HTML 解码入口 |
| `internal/dto/dto.go` | Wails DTO | 增加格式和导入保存 DTO |
| `frontend/src/api/index.ts` | Go 与前端适配 | 保留格式字段、结构化失败原因 |
| `frontend/src/stores/documents.ts` | 文档生命周期 | 区分来源与保存目标，集中能力检查 |
| `frontend/src/shared/types.ts` | 另一个 DocState 定义 | 收敛成唯一文档类型，防止两个定义漂移 |
| `frontend/src/components/EditorHost.vue` | 编辑器、缓存、命令、自动保存 | 只读保护及转换版本缓存失效 |
| `frontend/src/editor/live/createLiveEditor.ts` | Milkdown 实例 | readOnly 参数目前有声明，需真正接入 |
| `frontend/src/editor/source/createSourceEditor.ts` | CodeMirror 实例 | 已有 readOnly，补程序命令拦截 |
| `frontend/src/App.vue` / `TitleBar.vue` | 打开、快捷键、启动恢复 | 所有入口走同一导入流程 |

现有 `path` 同时服务保存和资源定位，不能直接把 HTML 路径放进普通 Markdown 文档后仅禁用输入。现有 SaveFileAs 会强制写入选中目标，HTML 导入必须走专门的导出协议。

## 3. 用户行为与界面

### 3.1 打开

文件对话框增加 HTML 过滤项，统一“支持的文档”过滤项包含 Markdown、TXT、HTML。工作区、拖拽、最近文件、命令行和会话恢复均识别同一扩展名集合，大小写不敏感。TXT 仍按现有文本逻辑处理，不根据内容猜测 HTML。

导入创建一个加载中的标签，标题使用文件名。转换超过 300 ms 显示“正在转换 HTML…”和取消按钮。取消移除本次尚未完成的标签。失败保留错误视图，提供重试、编码选择、关闭；不得伪装成空 Markdown 文档。

转换成功显示常驻条：“HTML 转换预览 · 只读”，主按钮“另存为 Markdown”，次按钮“转换说明”。有降级时显示“有 N 类内容已简化或未转换”。无降级时仍提示网页布局样式不保留，不显示准确率。

### 3.2 操作矩阵

| 操作 | HTML 预览 | 另存为成功后 |
| --- | --- | --- |
| 阅读、选中、复制、查找、导航、缩放 | 允许 | 允许 |
| 查看源码 | 显示转换后的 Markdown，只读 | 正常源码编辑 |
| 输入、IME、剪切、粘贴、删除、拖入内容 | 禁止内容修改 | 允许 |
| 替换、格式化、撤销重做 | 禁用 | 允许 |
| 勾选任务、表格增删、图片插入、代码编辑 | 禁用 | 允许 |
| Ctrl+S / Ctrl+Shift+S | 另存为 Markdown | 现有行为 |
| Ctrl+H | 打开查找，提示“另存为后可替换” | 替换 |
| 自动保存、草稿备份 | 不执行 | 现有行为 |
| 关闭 | 直接关闭 | 现有未保存检查 |
| HTML 导出 | 第一版禁用，提示先另存为 Markdown | 现有行为 |

右键菜单保留复制、全选等阅读操作；禁用项显示原因，不移除导致菜单跳动。查找和选择事务必须正常运行，不能一律禁止编辑器 transaction。

### 3.3 另存为

默认文件名去除 `.html/.htm` 后追加 `.md`；文件名采用源文件名，不采用可能包含非法字符的 HTML title。默认编码 UTF-8 无 BOM，换行符使用用户 defaultEol（启动设置必须已经加载）。第一版不提供 GBK 输出，避免转换文字无法编码。

允许用户取消，取消不改变预览。写入失败保持只读，并保留转换结果供重试。仅成功后更新当前标签为目标文件名，切换为可编辑，清空旧 HTML 编辑器缓存。保持当前显示模式，光标尝试映射到原位置，失败落到文首。

禁止另存为源 HTML 的同一路径（规范化、大小写和文件身份检查），禁止 `.html/.htm` 目标。无扩展名补 `.md`，其他扩展名提示选择 `.md`。目标已在其他标签打开时拒绝本次操作并提示先关闭目标标签，不能制造两个指向同一文件的可编辑标签。

## 4. 数据模型

将唯一文档类型放在 `frontend/src/shared/documentTypes.ts`；stores 与 editor/sync 引用它。保留现有 Markdown 状态，HTML 源变化不复用 dirty/conflict。

```ts
type DiskFingerprint = { hash: string; mtimeMs: number; size: number };
type ConversionWarning = {
  code: string;
  severity: 'info' | 'warning';
  count: number;
  message: string;
  samples: Array<{ line?: number; text?: string }>;
};
type HtmlImportMeta = {
  sourcePath: string;
  sourceDisk: DiskFingerprint;
  sourceEncoding: string;
  sourceState: 'unchanged' | 'changed' | 'deleted' | 'unknown';
  converterVersion: 'html-v1';
  generation: number;
  warnings: ConversionWarning[];
  references: HtmlReference[];
};
type HtmlReference = {
  id: string;
  kind: 'image' | 'link';
  original: string;
  resolved: string; // 绝对 URL 或规范化 file URL，不是 WebView 临时 token
  state: 'available' | 'missing' | 'remote' | 'unsupported';
};
// 公共字段还包括 id/title/mode/content/cursor/scrollTop。
type DocumentOrigin =
  | { kind: 'markdown'; path: string | null; htmlImport?: never }
  | { kind: 'html-preview'; path: null; htmlImport: HtmlImportMeta };
```

HTML 文档 `content` 是转换 Markdown，`status` 固定 clean；转换进行状态放在独立 importJobs 映射中，不进入保存状态枚举。disk 只属于 Markdown 保存目标；HTML 指纹存 sourceDisk。生成版本 generation 每次重新转换成功加一。

统一方法：`getDocumentCapabilities(doc)` 返回 edit/save/saveAs/find/replace/exportHtml；`getDocumentSourcePath(doc)` 返回 htmlImport.sourcePath 或 path。checkDuplicate 对此来源路径去重；HTML 保存成 MD 后 sourcePath 不再参与去重，再次打开原 HTML 应产生独立预览。

源码与可视化切换时不重新序列化覆盖 HTML 预览 content；转换结果是唯一正文。保存后的普通文档重新建立 baseline。

## 5. 后端读取与前端转换契约

### 5.1 打开 DTO

DocumentPayload 增加 `format: 'markdown' | 'html'`。旧数据缺失 format 时默认 markdown。HTML Content 是解码后的源 HTML，不是 Markdown。Disk hash 取原始字节；Encoding 指源编码。返回源文件的实际绝对路径。

沿用 OpenFileDialog/OpenFileByPath，但 fileApi 返回带 format 的统一 OpenDocumentResult。禁止在任何组件直接把 format=html 的 content 传给 Markdown 编辑器。入口统一调用异步 `documents.openDocumentPayload(payload)`，内部按 format 分支。

### 5.2 编码

新增 DecodeHTMLContent(raw, encodingOverride)。第一版支持 UTF-8、UTF-8 BOM、GBK/GB18030：BOM 优先；其次读取前 1024 字节中合法 charset/meta http-equiv 声明；无声明且字节为有效 UTF-8 使用 UTF-8，否则返回需选择编码。不要照搬“所有非 UTF-8 都是 GBK”的静默假设。

未知声明、UTF-16、解码失败返回结构化 UNSUPPORTED_ENCODING/DECODE_FAILED，允许用户选择支持的编码重试。编码选择优先于 meta、不能优先于实际 BOM。编码名统一规范化；解码器若产生替换字符需返回 DECODE_FAILED，而非直接输出乱码。源本来就包含 U+FFFD 的 UTF-8 文本不据此判错。

### 5.3 转换接口

新增 `frontend/src/import/html/`：types.ts、convert.ts、normalize.ts、rules.ts、references.ts、warnings.ts、worker.ts、client.ts。

```ts
type ConvertInput = {
  requestId: string;
  html: string;
  sourceFileUrl: string;
  converterVersion: 'html-v1';
};
type ConvertOutput = {
  requestId: string;
  markdown: string;
  title?: string;
  warnings: ConversionWarning[];
  references: HtmlReference[];
  stats: { nodes: number; headings: number; images: number; tables: number };
};
```

转换纯函数不读取 store、不写文件、不访问网络。通过专用 Worker 执行；主线程 client 管理超时、取消和 generation。结果 requestId/generation 不匹配或标签已关闭则丢弃。取消直接终止该 Worker；第一版最多并行两个任务，其余排队，每任务使用独立 Worker，结束即释放。

## 6. 转换管线与规则

依赖新增 rehype-parse、rehype-remark；复用 unified、remark-gfm、remark-stringify。实施时锁定经测试兼容的具体版本及 lockfile，不使用运行时 CDN。HTML AST 用 hast，Markdown AST 用 mdast；通过节点规则处理，禁止用正则表达式替代 HTML 解析。

顺序：解析完整文档 → 取 body → 保留 title 元信息 → 清理 → 规范容器 → 资源地址解析 → 自定义 handlers → rehype-remark → GFM 序列化。输出正文统一 LF、文尾一个换行；保存时再转用户配置 EOL。标题 ATX，列表 `-`，代码 fenced，普通内容按 Markdown 转义规则输出。

### 6.1 文本与容器

1. HTML 实体由解析器解码一次；Markdown serializer 负责转义星号、下划线、括号等，不做全局二次 decode。
2. 普通文本按 HTML 空白语义折叠，保留中文内容；pre/code 不折叠空格、制表符、换行。
3. div/section/article/main/header/footer/nav/aside 是块边界；span 是行内容器；未知标签递归保留子内容，不猜测标题。
4. 移除 head 中展示无关节点、script/style/template/comment。noscript 第一版不输出，以免与静态正文重复；有正文被略过则记说明。
5. hidden 属性和明确内联 display:none/visibility:hidden 节点不输出；不加载外部 CSS，不推断 class 的显示状态，因此外部 CSS 隐藏的文本可能保留，写入通用限制说明。
6. 不自动用 title 生成 H1，以免重复文章标题。title 用于转换说明，不替换标签文件名。
7. 仅有空白、脚本或布局而无正文/图片/表格时返回 EMPTY_CONTENT。合法图片文章不能误判空文档。

### 6.2 结构映射

| 输入 | 规则 |
| --- | --- |
| h1–h6 | 保留级别，包括跳级，去除纯布局属性 |
| p/br/hr | 段落、硬换行、分隔线 |
| strong/b/em/i/del/s | 对应强调、删除线 |
| u、颜色、居中 | 保留文字，忽略样式；聚合 STYLE_DROPPED |
| ul/ol/li | 保留嵌套，ol start 保留；reversed 或不连续 li value 改显式编号文本并提示 |
| blockquote | 保留递归引用结构 |
| pre/code | fenced code；language-* 可提取语言；围栏长度避开正文里的反引号 |
| input checkbox 位于 li | 转任务列表，checked 决定状态；其他表单控件保留 label/静态值并提示 |
| details/summary | summary 转普通加粗段落，随后正文，忽略折叠状态 |
| dl/dt/dd | 术语加粗段落及缩进说明，不输出非标准扩展语法 |
| img | 标准 image 节点；alt/title 保留；失败地址保留说明 |
| audio/video/iframe | 有 src 输出链接与可用标题，无 src 输出“嵌入内容未转换”及 warning |
| svg/canvas/math | 有可识别文本保留文本，否则占位说明；不伪造公式/图形 |

### 6.3 表格

简单表格资格：无 rowspan/colspan（除值1）、无嵌套表格、每行列数相同、单元格内容可表达为行内文本。第一行全 th 或 thead 第一行可作表头；没有表头则插入空表头，不能把第一行数据直接当标题而改变语义。

单元格竖线由 serializer 转义。单元格含多个块、列表或多行布局视作复杂表格。caption 输出为表格前段落。多级表头视作复杂表格。

复杂表格按 DOM 行顺序输出带行号的列表，每个原始单元格保留文字；明确标注跨行/跨列范围，不复制合并单元格文字制造假数据。嵌套表格递归输出在对应单元格下。示例：`第 1 行：第 1 格（跨 2 列）：预算；第 3 格：实际`。聚合 TABLE_SIMPLIFIED，说明此结果仅保留阅读顺序、非等价矩形数据。

### 6.4 地址、锚点与图片

使用 URL 解析规则和 Windows file URL 转换工具处理地址，禁止简单字符串拼接。基础 URL 默认源文件目录；首个合法 base href 参与解析，相对 base 相对于源文件解析。解析后区分 http/https、file、data、mailto/tel、纯片段和不支持协议。

图片 src 非空时使用 src；仅 src 缺失时使用 data-src，再使用 data-original。srcset 单独存在时选最大明确宽度候选，无宽度选择首项；不能仅按逗号粗拆 data URL。此类启发式记录 IMAGE_SOURCE_FALLBACK。不猜测加载占位图是否应替换。

HTML id 与 Markdown slug 不一定一致。转换标题后用项目相同 slug 算法建立 id→slug 映射（含重复标题计数），重写指向这些标题的片段。指向非标题 id 的链接保留为源 HTML 的绝对 file URL+fragment，并提示 ANCHOR_NOT_MAPPED；不能生成指向不存在 Markdown 锚点的链接。

转换内部 Markdown 的资源引用使用规范化绝对地址。预览图片由资源适配器按 sourcePath 解析为现有资产服务地址；临时 token 只在渲染层使用，不写入 content 或保存文件。远程图片遵守已有 networkImagePolicy，不在转换器中下载。

## 7. 只读实现

三层约束同时实施：

1. UI：根据 capabilities 禁用修改菜单、替换、任务复选框、表格和图片编辑控件。
2. 命令层：executeEditorAction、快捷键、粘贴处理和插件命令统一检查 canEdit；只读时仅允许复制、查找和导航。
3. 状态层：store.updateContent 拒绝 html-preview 的编辑回写；转换结果仅能由 applyHtmlConversion 更新。saveDocument 对 html-preview 分派专用另存为，自动保存和备份提前跳过。

Milkdown 配置 editable=false，并添加 filterTransaction：readOnly && tr.docChanged 时拒绝，selection/meta 事务允许。CodeMirror 设置 EditorState.readOnly 和 EditorView.editable=false，并用 transactionFilter 拒绝 docChanged，避免外部 dispatch 绕过。原生选区、复制和搜索高亮必须可用。

插件收到 readOnly 能力；特别检查 taskListPlugin、tablePlugin、codeBlockPlugin、imagePlugin、keymapPlugin。不得依赖 UI disabled 作为唯一保护。

EditorHost 缓存键加入 kind、generation；成功转换、重载、另存为转换类型后释放该文档所有旧缓存。不要修改现有 Markdown 标签切换保留撤销历史的行为。HTML 预览无需创建可修改历史。

## 8. 另存为协议与资源事务

### 8.1 为什么分阶段

目标目录必须由原生保存对话框确定；确定之后才能重写资源相对路径。现有 SaveFileAs(content) 无法覆盖这一步骤，因此新增 HtmlImportService。Go 负责路径、资源和落盘，前端负责 Markdown AST 重写，不在 Go 用正则替换正文路径。

### 8.2 Wails 接口（新增 DTO 并重新生成 bindings）

```ts
BeginHtmlSave({ documentId, sourcePath, suggestedName, references })
// => { status: 'cancelled' } 或
// { status: 'ready', ticket, targetPath, targetDisk?,
//   rewrites: Array<{referenceId, from, to}>, warnings, expiresAt }

CommitHtmlSave({ ticket, markdown, eol: 'lf' | 'crlf' })
// => { status: 'saved', path, disk, encoding: 'utf8' }
// 或 { status: 'failed', code, message, retryable }

AbortHtmlSave({ ticket }) // 幂等清理，只清理本次创建的文件
```

Begin 内部保存 sourcePath、目标指纹、资源来源指纹、计划和暂存目录，ticket 有效期10分钟。用户取消返回 cancelled，不作为 error。前端收到 ready 后先查其他打开标签是否指向 targetPath，冲突则 Abort，提示关闭目标标签再试。

### 8.3 保存步骤

1. 对同一文档设置 importSaving，禁止重复保存/重新转换；不禁止阅读。用户关闭时取消未提交任务；已进入 Commit 则等待结束后关闭。
2. Begin 展示 `.md` 保存对话框；校验源与目标不同、目标扩展名正确、现有文件覆盖已经由原生对话框确认。记录目标当前指纹（或不存在）。
3. 读取本地图片和支持的 data 图片，按内容 SHA-256 去重。支持 PNG/JPEG/GIF/WebP，实际类型由内容识别；SVG 等不复制，保留原引用并说明。
4. 为本次导出分配独立资源子目录 `文件名.assets/import-<随机ID>/`。文件名使用内容哈希前16位加扩展名；若发现名称冲突必须比较完整哈希，冲突使用完整哈希。独立目录保证不覆盖已有资源。
5. 资源先写到目标目录下的临时 staging。Begin 返回 rewrites，目标引用使用 `/` 分隔的相对 URL，正确编码空格、#、% 和中文。缺失源图片保留绝对 file URL 并提示，不能写一个实际上不存在的“已复制”目标。
6. 前端对转换 Markdown 重新 parse，按 AST image/link URL 精确匹配 from 重写；不做全文 replace，以免改掉代码块或正文中相同字符串。普通本地文件链接重新计算相对地址，不复制链接目标，也不改扩展名。跨盘无法表达相对路径时保留 file URL。
7. Commit 校验 ticket、目标指纹、图片来源指纹。目标已变化返回 TARGET_CHANGED，不强制覆盖；图片变化返回 ASSET_CHANGED，要求重新准备。确认无误后发布本次唯一资源目录，再用现有原子文件写入机制写 Markdown。
8. Markdown 写入失败时删除本次创建的唯一资源目录，保留原目标。不得删除原有用户资源。成功后返回磁盘指纹，前端一次性把文档改为 markdown/clean，content 使用实际写入的重写后正文，path 使用目标路径。
9. 增加目标到最近文件和监控；解绑该标签对源 HTML 的订阅。原 HTML 的最近文件记录仍保留。

跨多个文件无法保证真正原子事务。设计保证先资源后 Markdown：崩溃最多留下孤立资源，不会发布引用尚未完成资源的 Markdown。staging 与事务日志在下次启动清理；对已经提交或无法确定的目录不得删除，只清理明确属于未提交事务的资源。孤立目录清理不得阻塞启动。

如果窗口在磁盘提交成功、前端响应前关闭，目标文件仍有效；不得因前端没有确认就回滚成功文件。Abort 对已提交 ticket 只返回 committed，不删除任何结果。

## 9. 状态流转与竞态

| 起点 | 事件 | 终点 | 要求 |
| --- | --- | --- | --- |
| 未打开 | 打开 HTML | importing | 路径去重，分配 requestId |
| importing | 转换成功 | preview | 一次性更新内容和说明 |
| importing | 失败 | import-error | 可重试，不创建 dirty 文档 |
| preview | 另存为 | preparing-save | 快照固定，不允许重载 |
| preparing-save | 取消/失败 | preview | 内容和路径不变 |
| preparing-save | Commit成功 | markdown clean | 类型、缓存、路径一起更新 |
| preview | 源变化 | preview changed | 保留当前内容，提示重新转换 |
| preview changed | 重新转换成功 | preview unchanged | generation+1 |
| preview | 源删除 | preview deleted | 仍可保存现有转换结果 |

重新转换失败保留旧预览，并展示失败提示，不能清空正文。保存快照不要求源 HTML 仍存在；其关联图片若已丢失按缺失资源规则处理。源变化时另存为保存的是当前看到的快照，并在保存前以提示条说明“源已变化，正在保存当前预览”。

打开/转换任务与文档绑定；切标签不取消，关闭标签取消。源监控事件防抖300ms，只更新 sourceState，不自动调用普通 reloadFromDisk。忽略属于已失效 generation 的异步回调。

会话 tabs 增加 kind 和 sourcePath；旧会话默认 markdown。HTML 仅保存源路径、模式、选区/滚动信息，不进入草稿备份。重启按源文件重新转换；源丢失提示该项恢复失败，不伪造空文档。源和转换器版本变化可能导致内容变化，属预期行为。

## 10. 资源限制与错误定义

第一版集中常量：源文件20 MiB、解码后字符串40 MiB（按 UTF-8 字节计算）、AST 节点100000、嵌套深度256、单次转换15秒、单张图片20 MiB、单次复制资源总量100 MiB。parse 前限制输入，parse 后用迭代遍历统计节点/深度；Worker 超时终止。不要承诺仅靠 parse 后深度检查就能防止解析阶段耗尽资源。

错误 code：UNSUPPORTED_ENCODING、DECODE_FAILED、FILE_TOO_LARGE、CONVERSION_LIMIT、CONVERSION_TIMEOUT、EMPTY_CONTENT、SOURCE_READ_FAILED、INVALID_TARGET、TARGET_OPEN、TARGET_CHANGED、ASSET_CHANGED、ASSET_WRITE_FAILED、MARKDOWN_WRITE_FAILED、SAVE_TICKET_EXPIRED。每个错误提供中文 message 和 retryable；取消是正常结果。

warning code 至少：STYLE_DROPPED、TABLE_SIMPLIFIED、EMBED_OMITTED、GRAPHIC_UNSUPPORTED、IMAGE_SOURCE_FALLBACK、IMAGE_MISSING、IMAGE_NOT_COPIED、ANCHOR_NOT_MAPPED、UNSUPPORTED_LINK、NOSCRIPT_OMITTED。同类聚合计数，最多保留5个样例，每个样例最多120字。定位使用源 AST 的行号，不声称对应 Markdown 行号。

## 11. 代码改动任务清单

1. `shared/documentTypes.ts`：统一模型和 capabilities；更新所有 DocState 引用。
2. `internal/dto/dto.go`：format、HTML 保存 DTO、明确结果状态；重新生成 frontend/bindings，禁止仅手改生成文件。
3. `internal/filesystem/html_encoding.go`：独立 HTML 解码与测试；不改变原 Markdown 解码行为。
4. `file_service.go`：打开格式识别；`workspace_service.go` 的文件列表、重命名规则允许 HTML。创建新文件仍默认 Markdown，不新增“新建 HTML”。
5. `internal/app/app.go` 及 Windows 安装关联配置：支持 HTML 打开参数；不要把应用设置成系统默认浏览器，安装时不自动抢占 HTML 默认关联。
6. `internal/services/html_import_service.go`：Begin/Commit/Abort、事务清理；在 app 中注册服务。
7. `frontend/src/import/html/*`：转换器、Worker、AST 规则、说明、地址处理。
8. `api/index.ts`：结构化打开/导入保存适配，不吞掉失败原因；纯浏览器 mock 必须同样返回 format，不能把失败模拟成成功。
9. `stores/documents.ts`：统一打开分派、只读 guard、另存为状态、监控分支和去重；新增 import job 管理模块，避免全部塞进 store。
10. `EditorHost.vue` 与 editor 插件：只读能力、generation 缓存、源码只读切换。
11. `HtmlImportNotice.vue` / `ConversionDetailsDialog.vue`：加载、结果、说明和另存为入口；复用项目视觉样式。
12. `App.vue`、`TitleBar.vue`、`FindBar.vue`、`EditorContextMenu.vue`、`FilePanel.vue`、`TabBar.vue`、`StatusBar.vue`、`Welcome.vue`：统一行为、标识、过滤和快捷键。
13. `backup_service.go`、session DTO、启动恢复：HTML 预览只恢复来源，不生成草稿。
14. `zh-CN.ts`、README：用户文案、支持范围、限制说明。

## 12. 测试样本与自动化验收

新增 `tests/fixtures/html/`，每个样例配输入 HTML、期望 Markdown 和 warning JSON；断言语义 AST，必要处断言精确字符串。转换器测试不依赖桌面 runtime 或网络。

| 编号 | 场景 | 必须满足 |
| --- | --- | --- |
| C01 | h1–h6、多层div/span、自定义容器 | 标题层级、顺序和文字一致 |
| C02 | 中文、实体、Markdown特殊字符 | 不乱码、不双解码、不意外强调 |
| C03 | pre内缩进/反引号/空行 | 代码正文逐字符保留 |
| C04 | 嵌套列表、ol start、任务列表 | 结构及勾选状态正确 |
| C05 | 有/无表头、竖线、caption | 数据不被吞作表头，列数正确 |
| C06 | rowspan/colspan/嵌套表格 | 明确降级，所有单元格文本仍存在 |
| C07 | JS空壳、纯图片、空文件 | 分别失败、成功、失败 |
| C08 | base、中文路径、空格、#、跨盘 | 地址解析和保存重写正确 |
| C09 | 重复标题id、非标题锚点 | 映射正确或明确降级 |
| C10 | data图片、重复图片、缺失图片 | 去重、可用文件、缺失说明 |
| C11 | UTF8/BOM/GBK/GB18030/错误声明 | 依规则成功或明确失败 |
| C12 | 节点/深度/时间超限、取消 | 可退出，主界面可继续操作 |
| U01 | 输入、IME、粘贴、剪切、删除 | 两模式内容不变 |
| U02 | task/table/code/image插件修改 | 内容不变，无dirty/backup |
| U03 | 查找、选择、复制、大纲 | 正常工作 |
| U04 | Ctrl+S、Ctrl+Shift+S、Ctrl+H | 专用另存为/只读查找行为正确 |
| U05 | 取消、权限失败、磁盘满 | 仍为HTML预览，源hash不变 |
| U06 | 保存成功后输入、撤销、重开 | 正常MD，baseline和路径正确 |
| U07 | 标签切换、模式切换、重载 | 只读状态不因缓存失效 |
| U08 | 目标文件已在其他标签打开 | 拒绝，两个标签内容不变 |
| R01 | 不同目录另存为 | 图片复制正确，重开可见 |
| R02 | 资源成功、MD写入失败 | 原目标不变，只清理本次资源 |
| R03 | 目标/图片准备后被外部修改 | 检测冲突，不覆盖新内容 |
| R04 | Commit成功但响应丢失 | 已保存文件不被Abort/清理删除 |
| R05 | 源删除后保存 | 文字可保存，缺失资源有说明 |
| S01 | restore/blank/welcome启动 | 遵守原设置，HTML不触发草稿恢复 |

新增前端：htmlConversion.test.ts、htmlReadOnly.test.ts、htmlSave.test.ts、htmlSession.test.ts；新增Go：html_encoding_test.go、html_import_service_test.go。后端通过临时目录和注入保存路径选择器测试，无需弹原生对话框。

桌面实测必须覆盖原生对话框取消/覆盖、拖入HTML、命令行打开、WebView2 IME只读、任务点击、源变更、跨盘另存为、应用关闭期间保存。自动化通过不能替代这些桌面验收。

## 13. 实施顺序与完成条件

阶段A：唯一模型、DTO和读取类型；现有Markdown测试不回归。

阶段B：纯转换器与fixtures；C01–C12通过，确定具体降级输出。

阶段C：只读预览和所有打开入口；U01–U04、U07及会话测试通过。

阶段D：资源事务与另存为；U05–U06、U08、R01–R05通过。

阶段E：运行 `cd frontend; npm test`、`npm run typecheck`、`npm run build`，根目录 `go test ./...`；完成桌面实测，更新README。

交付条件：以上阶段全部完成；未支持内容都有确定降级规则；任何路径均不能把转换Markdown写入源HTML；保存失败不解锁编辑；保存后的MD及本地图片可独立重新打开；原有Markdown编辑/保存/恢复功能无回归。

## 14. 参考与后续扩展

- [rehype-remark：HTML AST 转 Markdown AST](https://github.com/rehypejs/rehype-remark)
- [Turndown：备选转换器](https://github.com/mixmark-io/turndown)
- [Turndown GFM 插件](https://github.com/mixmark-io/turndown-plugin-gfm)

后续正文提取应作为可选“提取正文”步骤放在转换规则之前，保留“转换全文”回退；特殊网站、数学源恢复、SVG资产和网络图片下载分别作为独立能力扩展。不得通过猜测CSS字号提升第一版的表面成功率。

## 15. 转换兼容性、独立规则引擎与降级设计（实施重点）

### 15.1 模块边界与约束

转换不是打开文档代码中的分支集合，而是可独立运行、独立测试的模块。外部仅依赖 `import/html/index.ts` 导出的输入、结果类型和 convertHTML 方法。Worker 只是执行适配器，不拥有转换规则。

```text
frontend/src/import/html/
  index.ts                    # 唯一公共入口
  contracts.ts                # 输入、输出、诊断、规则契约
  engine/
    convert.ts                # 固定阶段编排，不写标签/网站分支
    registry.ts               # 加载、排序、校验规则
    context.ts                # 递归转换、诊断、资源登记、位置追踪
    assess.ts                 # 结果分级，不依赖具体规则名称
    serialize.ts              # mdast输出及GFM序列化
  rules/
    standard/                 # 标题、段落、代码、列表等
    tables/                   # 规则表格、复杂表格降级
    media/                    # 图片、视频、图形降级
    adapters/                 # 后续新增明确格式适配，不默认猜网站
    fallback/                 # 未知容器、未知叶节点、纯文本恢复
    manifest.ts               # 显式列出启用规则
  presets/default.ts          # 默认规则集合和兼容策略
  worker.ts                   # 线程消息入口
  client.ts                   # 排队、取消、超时
```

不得引用 Vue、Pinia、Wails、EditorHost、文件服务、DOM 编辑器状态。输入是 HTML 字符串与基础 URL，输出是 Markdown、资源引用及结构化诊断。读取本地文件、加载图片、写入目标由外部适配层完成。

新增常规规则只允许触及：新规则文件、manifest、对应fixtures与测试；不得要求修改打开流程、store、EditorHost或保存服务。新增输出仍限定于现有 Markdown AST 节点与 HtmlReference，若引入现有编辑器无法处理的新语法，则属于跨模块功能扩展，不能假称只是新增规则。

第一版使用编译期显式注册，不引入用户脚本或运行时插件系统。manifest 不通过目录扫描自动启用未知文件。

### 15.2 规则接口

规则分两类：normalizer 对特定输入结构规范化；handler 将一个节点转换为 mdast。全局编排和语义转换不得混写。

```ts
interface RuleMeta {
  id: string;                 // 永久稳定，如 table.simple
  version: number;
  priority: number;
  description: string;
}

interface HtmlHandler extends RuleMeta {
  phase: 'convert';
  match(node: HastNode, ctx: ReadonlyRuleContext): boolean;
  convert(node: HastNode, ctx: RuleContext): RuleOutcome;
}

type RuleOutcome =
  | { action: 'converted'; nodes: MdastNode[]; issues?: Issue[] }
  | { action: 'degraded'; nodes: MdastNode[]; issues: Issue[] }
  | { action: 'omit'; issues: Issue[] }
  | { action: 'delegate' };

interface HtmlNormalizer extends RuleMeta {
  phase: 'normalize';
  match(node: HastNode, ctx: ReadonlyRuleContext): boolean;
  normalize(node: HastNode, ctx: NormalizationContext): NormalizationResult;
}
```

这里 HastNode/MdastNode 对应实际库类型，不使用 any。RuleContext 只暴露 `convertChildren`、`convertNode`、`registerReference`、`reportIssue`、`getSourceLocation`、只读配置；不得向规则传入整个引擎内部对象。

normalizer 只改 AST 副本，必须保留节点来源映射。按排序执行单次有界遍历，禁止通过“反复执行到稳定”为默认方式。修改生成节点不得无限重新触发自身；需要二次处理时明确交给后续阶段。

handler 不修改输入树；由引擎缓冲该规则本次的诊断和资源登记，成功才提交。delegate 时丢弃本次副作用并尝试下一规则。omit 必须带理由；仅 script/style 等明确非正文可以标 info，正文省略必须标 warning 或 error。

每个节点只接受一个最终 handler。返回 converted/degraded 后不再额外转换同一节点的子节点，防止文字重复；需要子内容由规则显式调用 convertChildren。未知节点回退规则最终兜底。

### 15.3 匹配与优先级

固定顺序：输入诊断 → parse → normalize → convert → 结构校验 → serialize → assess。

每阶段按 priority 降序、id 字典序稳定排序。建议区间：1000以上为明确格式适配，500–999为标准语义，100–499为结构降级，0及以下为通用兜底。id 重复直接启动校验失败；相同优先级允许但结果必须稳定，不依赖模块导入顺序。

适配规则必须有可验证的结构特征，并具备反例。不得仅凭 class 包含 title 就提升标题层级，也不得按文件名推断网页类型。遇到“已识别格式但不满足转换前置条件”必须 delegate，而非输出半截错误结构。

代码块和应忽略的原始文本区域必须由其父规则完整处理，避免先对内部看似 HTML 的文本应用标签规则。标准 heading 等规则注册后通过同一个 dispatcher 执行；若底层使用 rehype-remark handlers，必须把规则引擎嵌入该转换入口，不能再隐式运行第二遍默认转换。

### 15.4 文档级兼容性矩阵

| HTML 类型 | 默认结果预期 | 限制与提示 |
| --- | --- | --- |
| 规范文章、文档导出的语义HTML | complete | 可忽略纯视觉样式，不能声称像素还原 |
| 多层div/span包裹的标准文章 | complete | 按语义节点转换，与嵌套层数无关（限额内） |
| 完整门户网页，含正文/导航/推荐 | complete或degraded | 转换静态全文，不声称已提取文章 |
| 通过字号和粗体模拟标题的富文本 | degraded | 保留段落文字，不猜标题；说明样式结构未保留 |
| Word等生成的大量专有标记 | degraded | 通用规则保留可读内容，不承诺专有列表/页布局 |
| 简单表格报告 | complete | 标准矩形表格及文字保留 |
| 合并单元格报表、嵌套表格 | degraded | 逐行文字降级，不可当等价表格继续计算 |
| 静态图片文章 | complete或degraded | 可用img引用算内容；缺失资源明确提示 |
| SPA脚本空壳、只有挂载容器 | unsupported | 无静态正文；不运行JS |
| Canvas/SVG组成的整页海报 | unsupported | 无可保留正文/标准图片引用时不能假成功 |
| 混有正文与Canvas/iframe的页面 | degraded | 正文可用，未转换区域有说明 |
| 破损但解析器可修复的HTML | 按实际结果评估 | 标签未闭合本身不意味着失败 |
| 编码错误、资源限额、内部异常 | failed | 明确故障，可按原因重试 |

以上是预期分类，不通过“来源名字”直接决定结果。实际结果由节点处理记录和诊断决定。样式模拟标题若无法识别，只能显示通用样式限制，不声称已经检测所有伪标题。

### 15.5 结果契约与失败判定

替换第5.3节 ConvertOutput：

```ts
type ConversionResult =
  | { status: 'complete' | 'degraded'; requestId: string;
      markdown: string; references: HtmlReference[];
      issues: Issue[]; summary: ConversionSummary }
  | { status: 'unsupported'; requestId: string;
      reason: 'NO_STATIC_CONTENT' | 'EMPTY_DOCUMENT' |
              'ONLY_UNSUPPORTED_CONTENT';
      issues: Issue[]; summary: ConversionSummary }
  | { status: 'failed'; requestId: string;
      error: { code: string; message: string; retryable: boolean } };

interface Issue {
  code: string;
  severity: 'info' | 'warning' | 'error';
  impact: 'appearance' | 'structure' | 'content' | 'resource';
  ruleId?: string;
  ruleVersion?: number;
  message: string;
  source?: { line?: number; column?: number; snippet?: string };
  fallback: 'none' | 'plain-text' | 'row-list' | 'link' | 'placeholder' | 'omit';
}

interface ConversionSummary {
  converterVersion: string;
  ruleSetVersion: string;
  ruleSetFingerprint: string;
  meaningfulTextChars: number;
  retainedImageCount: number;
  degradedBlockCount: number;
  omittedContentBlockCount: number;
}
```

取消是 client 层 cancelled，不是转换失败。此前 warnings 作为 UI 聚合视图从 issues 生成；为迁移可保留 getter，但不能维护两套独立诊断。HtmlImportMeta 保存 issues、summary和转换状态；warning详情从中派生。unsupported 不创建可另存为的空Markdown正文，展示失败说明视图。

判定顺序必须固定：

1. 读取、编码、解析、限额、超时或无法恢复的内部错误 → failed。
2. 有效输出仅含引擎生成的占位说明、空白或分隔符 → unsupported。判断依赖输出节点来源标记，不能用Markdown字符串是否非空决定。
3. 没有文字但至少一个保留的标准图片引用 → 可以预览；图片缺失记degraded，不与纯Canvas空壳混淆。
4. 存在正文结构降级、正文省略、未知关键媒体、内部规则恢复或资源缺失 → degraded。
5. 其余 → complete。complete仅表示适用语义规则完成，不保证发现所有隐含语义；始终显示CSS布局不保留的说明。

不设置“保留文字不足50%就失败”等未经验证的阈值。无需计算不可证明的准确率。可显示实际数量：“1个表格转为逐行文字，2个嵌入区域未转换”。

诊断 NO_STATIC_CONTENT 只能说“未发现静态正文，可能依赖脚本生成”；HTML含script不是判定动态网页的充分条件。空白文件单独报 EMPTY_DOCUMENT。

### 15.6 降级阶梯与异常隔离

每个内容节点按以下顺序处理，且必须可从诊断追溯采用了哪一步：

1. 标准语义转换或显式适配规则；
2. 保留结构的有限简化，例如复杂表格转逐行列表；
3. 保留纯文本及合理块边界；
4. 有明确地址的媒体保留链接；
5. 无文本、无可用链接的内容输出占位说明并登记未转换。

普通未知容器递归保留子节点不视为失败；未知叶节点没有内容也不必制造成百上千条警告。只有发现实际内容被省略、结构被降级或媒体无法表达时，生成对应诊断。不要把每个div都报告为兼容性问题。

若单条规则抛异常，引擎丢弃该规则未提交的节点、资源和诊断，生成 RULE_EXECUTION_FAILED，转入不经过该规则的纯文本回退。其他兄弟节点继续转换；整个文档标degraded。禁止对同一故障节点递归重试相同规则。fallback本身失败或最终AST无效则整次failed，不吞掉内部错误宣告成功。

由引擎保证转换顺序、节点消费和副作用提交，规则仅承担局部逻辑。测试环境开启strict模式，规则异常直接使测试失败；生产允许上述降级，但保留技术诊断供排查。不得用运行时兜底掩盖已知规则bug。

### 15.7 提示与交互细化

| 结果 | 顶部文案 | 操作 |
| --- | --- | --- |
| complete | “HTML 转换预览 · 只读” | 另存为、转换说明 |
| degraded | “部分内容无法完整转换，请检查后另存为” | 另存为、展开转换说明、用默认浏览器查看源文件 |
| unsupported | “此 HTML 暂时无法转换为可用的 Markdown” | 原因、用默认浏览器查看源文件、重新转换、关闭 |
| failed | “HTML 转换失败：具体原因” | 按错误提供重试/编码选择/关闭 |

degraded 默认展示诊断摘要，不弹重复确认。若含 content/error 级别问题，默认展开详情；仍允许保存已经保留的内容，但保存按钮文字显示“保存当前转换结果”，让用户知道保存范围。只存在样式变化不升级为阻断弹窗。

“查看源文件”通过系统默认浏览器打开本地HTML；不是把源HTML放进编辑器执行。源不存在则禁用并解释。不能用外链网络请求替代打开本地文件。

转换说明按内容遗漏、结构简化、资源问题、外观变化排序；显示数量、少量样例和源行号。不要承诺源行号能精确定位转换后Markdown。提供“复制转换说明”，包含转换器/规则集版本，不默认复制全文或完整本地路径。

### 15.8 新增规则的开发规程

以新增一种富文本代码块适配为例：

1. 在fixtures中放一个最小真实结构样例、预期mdast/Markdown、诊断及反例；避免将整个带私人内容网页作为样本。
2. 在 rules/adapters 下实现唯一id的规则，明确match条件、priority、version、前置条件、输出与降级策略。
3. 把规则加入manifest；registry启动校验id、phase和priority，测试确保同一输入输出稳定。
4. 正例必须命中新规则，反例必须delegate并由原规则处理；测试只命中一次、无重复正文、无未知资源副作用。
5. 跑完整兼容fixtures，确认未改变标准标题、列表、代码、表格等结果；合法预期变化显式更新快照并说明原因。
6. bump ruleSetVersion；fingerprint由启用规则id/version/priority及preset配置稳定生成，不采用随机值或当前时间。
7. 不修改UI和保存逻辑。若需要新诊断code，generic详情仍能显示code/message/fallback，不要求每个新code在组件写分支。

普通规则更新后重新打开HTML使用新规则；已打开预览保持快照，只有用户“重新转换”才应用新规则。已另存为的Markdown绝不自动重转或覆盖。会话重开显示当前规则版本，转换结果变化属于重新导入，不冒充原快照。

### 15.9 必须补充的测试与交付要求

第12章增加：

- E01：加入一条测试规则，仅修改规则文件和manifest即可生效，UI/store/API无改动。
- E02：两规则同时匹配，优先级及delegate行为稳定；重复id启动失败。
- E03：单规则抛异常，其他正文保留，输出degraded和规则id；strict测试模式失败。
- E04：故障规则登记资源后抛错，不留下幽灵资源或重复诊断。
- E05：只有占位说明的Canvas/iframe页面为unsupported，不出现可保存空预览。
- E06：有正文加不可转换区域为degraded，保存结果确实包含保留下来的正文。
- E07：标准深层嵌套与未知容器不产生无意义兼容警告。
- E08：改变规则版本使fingerprint变化；同输入、同版本多次转换输出一致。
- E09：UI可展示一个此前不存在的issue code，无需改组件。
- E10：新增规则反例覆盖标准HTML、文本中包含类似标签的代码、空节点和极端嵌套。

阶段B完成条件提升为：转换模块能在不启动Vue/Wails的测试进程独立执行；complete/degraded/unsupported/failed均有样例；标准规则、适配规则、兜底规则经过同一个dispatcher；不存在转换输出非空就一律成功的判断。阶段C必须展示四类结果及原因，阶段D只接受complete/degraded的有效结果保存。
