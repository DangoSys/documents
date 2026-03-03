# Buckyball Documents 功能清单

这个文档需要永远保持最新，请实时同步，并保持绝对简洁

## 前端页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 文档首页 | `/docs/:locale` | 侧边栏目录树 + 欢迎提示 |
| 文档阅读 | `/docs/:locale/*` | Markdown 渲染，管理员可见编辑/翻译/删除按钮 |
| 文档编辑 | `/edit/:locale/*` | Markdown 编辑器，保存后 commit 到 GitHub |
| 新建文档 | `/docs/:locale/new` | 输入路径 + 编辑内容 |
| OAuth 回调 | `/auth/callback` | 存 token 后跳转 |
| 后台管理 | `/admin` | 管理管理员列表 |

## 后端 API

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/health` | GET | 公开 | 健康检查 |
| `/api/auth/login` | GET | 公开 | GitHub OAuth 跳转 |
| `/api/auth/callback` | GET | 公开 | OAuth 回调，签发 JWT |
| `/api/auth/me` | GET | 登录 | 当前用户信息 + 角色 |
| `/api/docs/tree/{locale}` | GET | 公开 | 文档目录树 |
| `/api/docs/file/{locale}/{path}` | GET | 公开 | 获取文档内容 |
| `/api/docs/file/{locale}/{path}` | PUT | 管理员 | 更新文档 |
| `/api/docs/file/{locale}/{path}` | POST | 管理员 | 新建文档 |
| `/api/docs/file/{locale}/{path}` | DELETE | 管理员 | 删除文档 |
| `/api/translate` | POST | 管理员 | 翻译文档 |
| `/api/users/admins` | GET | 管理员 | 获取管理员列表 |
| `/api/users/admins` | PUT | 管理员 | 更新管理员列表 |

## 前台 / 后台分工

**前台**（所有人可访问）：
- 浏览文档、切换文档语言（en/zh）、切换 UI 语言
- 登录后管理员额外可见：编辑、新建、删除、翻译按钮

**后台**（仅管理员，`/admin`）：
- 管理管理员列表（添加/移除 GitHub 用户名）
- 左侧导航栏预留扩展
