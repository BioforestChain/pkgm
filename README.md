# @bfchain/pkgm

PKGM 是一个 bfchian 包管理器，目前它主要用于产出 bfsp 这个工具。
也是在为包管理器沉淀一些基础的工具组件

## 安装

```
npm i -g @bfchian/pkgm
```

## BFSP

> bfsp 是一个可以构建无限深度的项目架构的项目管理器

> bfsp 是专门用于构建 bfchainSystem 项目风格的工具，它让开发者与 js 以及相关生态细节开发脱钩，专注于使用最原始的 typescript 语言进行项目开发。
> 目前它内部仍然直接依赖 nodejs 生态的软件进行构建。
> 在 bfsp 中，typescript 是生态的核心语言，而不是 js（我们计划未来直接运行 ts 代码，来将类型安全升级到运行时安全）。
> 但目前我们仍然在插件层级提供将 ts 的编译、打包等功能，方便在生态不健全的情况下，使用生态外部的功能来进行产品输出。

### 了解 bfsp.json 配置文件

由三个部分组成：

1. 基础部分
   - name: string
   - version: string
   - source: `{mainFilename:file,dirName:dir}`
1. 分解与依赖
   - dependencies: `project-name[]`
     > 所以在 bfsp 直接支持在`dependencies`写入整个项目数中的某一个项目的名词，在项目中拥有源码的情况下，它会自动转化成`projects`，以确保编译的依赖顺序正确。在没有源码的情况下，它会直接使用依赖安装的方式来导入包。
     > 如此一来，如果你现在先将某一个子项目独立出去让其它人开发，现在就可以直接通过`git init`将这个子项目完全隔离出去开发。
   - projects: `dir[]`
     > 子项目。
     > 你可以使用`../SOME_DIR`来将子项目指向父级的某一个文件夹，但不推荐这样做。我仍然建议你在`dependencies`中直接声明依赖。

### bfsp 命令行指令

1. bfsp init
   > 项目初始化模式
1. bfsp dev
   > 进入开发模式，支持 tsc 插件编译输出。
   >
   > > 对于 typescript 的版本，你可能没有选择的权力，因为我们提供了修改版的 tsc 和 tsserver 来统一 bfsp 生态下 ts 的定制化编译，并确保所有项目的配置一致性
1. bfsp build
   > 进入编译模式，支持 rollup 插件的编译输出

## License - 许可
<a rel="license" href="https://creativecommons.org/licenses/by-nc-sa/4.0/"><img alt="知识共享许可协议" style="border-width:0" src="https://i.creativecommons.org/l/by-nc-sa/4.0/88x31.png" /></a><br/>本作品采用 <a rel="license" href="https://creativecommons.org/licenses/by-na-sa/4.0/">知识共享署名-非商业性许可-相同方式共享 4.0 国际许可协议</a> 进行许可。