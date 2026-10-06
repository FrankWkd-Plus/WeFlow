# 各平台运行时依赖（Windows VC 运行库）

这里存放随安装包分发的 MSVC 运行时 DLL，按 **平台-架构** 分目录：

```
runtime/
  win32-x64/
    msvcp140.dll
    msvcp140_1.dll
    vcruntime140.dll
    vcruntime140_1.dll
  win32-arm64/        # 需要时按同样结构补上
```

## 为什么要按架构分目录

这些 DLL 是**架构相关**的。目录名必须与 electron-builder 的 `${arch}` 宏取值一致
（`x64` / `arm64`），因为 `package.json` 的 `build.win.extraFiles` 用
`resources/runtime/win32-${arch}/...` 引用它们。

如果把 x64 的 DLL 放进 arm64 的安装包，arm64 进程加载 `vcruntime140.dll` 时会先在
应用目录命中这个 x64 文件，直接以 `ERROR_BAD_EXE_FORMAT` 失败。

`scripts/prepare-electron-runtime.cjs` 用同样的规则把 DLL 同步进开发环境的
`node_modules/electron/dist`，并在当前架构没有对应目录时跳过。

## 缺少某个架构的 DLL 会怎样

不会构建失败。electron-builder 对不存在的 `extraFiles` 源只打一条
`file source doesn't exist` 警告后跳过，该架构的安装包就是不带这些 DLL
（arm64 上依赖系统自带的 VC 运行库）。

## 注意

本目录**不参与打包**：`build.extraResources` 的 filter 显式排除了 `runtime`。
DLL 只通过 `build.win.extraFiles` 落到 Windows 安装包的根目录，其它平台不会
被打进无用的 Windows 二进制。
