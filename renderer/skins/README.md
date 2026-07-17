# 皮肤 / 皮肤商城

## 分组设计

```
顶栏大类 category     →  全部 | 二次元 | 街景人物 | 纯色主题 …
商城分块 group（合集） →  动漫风格 | 经典人物 | 街景写真 | 纯色主题
卡片 skin             →  单张背景 / 主题
```

### 文件夹 = 合集（推荐）

```
renderer/skins/
  donman/           ← 合集 id=donman → 商城「动漫风格」
    jingling.png
    mao.png
    saibo.png
  gufeng.png        ← 根目录散图 → 默认「其他」，可在 catalog 指定 group
```

新合集步骤：

1. 建文件夹 `renderer/skins/我的合集/`
2. 丢图进去
3. （可选）在 `catalog.js` 的 `SKIN_SHOP_GROUPS` 加：

```js
{ id: "我的合集", name: "显示名", category: "anime", order: 15, folder: "我的合集" }
```

4. 重启应用

## 精修单张

在 `SKIN_SHOP_TEMPLATES` 写 `image` + `group` + `name` 等，覆盖自动扫描。

## 应用内

- **皮肤商城**：按合集分块展示，顶栏按大类筛选
- **本地换图**：进「我的」
- **通透** 滑条：图片皮肤下调节面板透明度
