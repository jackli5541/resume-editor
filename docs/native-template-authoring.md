# DOCX 高保真母版规范

官方模板必须在清理后的 DOCX 副本中使用 Word 内容控件标注槽位。为避免 LibreOffice 将 `w:text` 控件错误渲染为粗体，生产母版使用富文本内容控件容器，但填充器只写入纯文本。内容控件的标签使用以下协议：

- `resume:profile.name`、`resume:profile.job`、`resume:profile.mobile`、`resume:profile.email`、`resume:profile.photo`
- `resume:title`
- `resume:section:experience.title`、`resume:section:skills.content`
- `resume:repeat:education`、`resume:repeat:experience`、`resume:repeat:projects`
- 重复控件内部使用 `resume:item.start`、`resume:item.end`、`resume:item.organization`、`resume:item.role`、`resume:item.content`
- 列表型重复项可使用 `resume:item.name`、`resume:item.level`、`resume:item.date`
- 可排序区域使用 `resume:zone:<zone>`，其中每个完整模块包装为 `resume:section-block:<section-id>`；填充器按 Resume JSON 中同一区域的顺序重排模块
- 其他结构化模块使用 `resume:section:<section-id>.title`、`.content` 和 `.visible`

重复控件应包住一个完整段落组或表格行。不要让同一个绘图对象跨越重复控件边界。照片槽位必须保留一张 PNG/JPEG 占位图及其 DrawingML 关系。

发布步骤：运行 `npm run templates:qa` 完成安全扫描、槽位检查、固定样例填充、LibreOffice 渲染及逐页比较。只有 `minimumSsim >= 0.98`、`maximumChangedRatio <= 0.02` 且人工检查无裁切重叠时，才可使用 `--approve-manual` 生成批准报告并运行 `npm run templates:publish`。发布脚本会校验报告中的母版哈希，不能仅修改 manifest 绕过门禁。在线分页预览会在 Worker 内转换为 WebP 并由浏览器懒加载。
