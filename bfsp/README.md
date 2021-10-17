## Why BFSP

1. 减少配置
1. 提供一套 typescript 最佳实践
1. 开发者无需关心 tsc/rollup/esbuild 等 ts-to-js 工具生态，而是将 typescript 作为直接的可执行语言来看待。
1. 支持多平台模式，从而支持编译出 nodejs、browser 等平台的代码
1. 未来将加入对其它语言的互通支持，通过 ?2Js/Wasm

## Roadmap

> 多项目模式目前还处于提案状态，相关的开发在 bfsp v3 才会正式开始。
> 当前 v2 专注于单项目的打包与开发，如果需要多项目，可以作为`monorepo`模式下的`pacakges/*`文件夹进行开发

- [x] typings 文件夹下的`.ts`文件, 以及任意文件夹下的`.type.ts`文件,都会全部被包含到 prod 项目中的 typings 文件夹下
- [x] bin 文件夹下, `.bin.ts` 后缀的文件自动变成出口文件,用于输出 package.json 的 bin 指令
  - [ ] 可以通过 `bfsp exe/bin {projectName} {binName}` 来执行项目指令，可以缩写成`bfsx {projectName} {binName}`
    > `{projectName}`如果是`.`开头，那么就使用对应的文件夹作为`{projectName}`无需通过`npm仓库`或者`pkgm仓库`安装对应的模块
- [x] tests 文件夹下,`.test.ts`后缀的文件自动变成出口文件,用于输出测试用的可执行文件,但不会跟着被发布出去
- [x] `bin/dev` 需要启动以下作业:
  - [x] 监听更新 typescript 相关的配置文件与自动生成的代码
- [x] 将 bin 输出到 package.json
- [ ] 提供`#{Profile}`模式
  - [ ] 提供 package.json 的 exports 支持
  - [ ] 提供 package.json 的 imports 支持
- [x] 提供 test 指令
  > 前期使用 ava 来作为测试功能的后端,只需要启动 ava/cli 即可
  - [ ] 支持`?`选择器，比如输入 bfsp test ?，那么进入交互界面，用于选择特定的测试，执行并打印改指令，用于下一次快速执行
- [ ] 提供 fmt 指令
  > 提供默认的.prettierrc 文件
- [ ] 为 dev 模式提供 cmd 面板
  - [ ] 可以快速输入一些内置的指令与提示
    - [ ] test 提示测试模块的名字
    - [ ] fmt 提供格式化模式:diff/all;文件类型的提示:.ts/.json/.html 等
- [ ] 为 dev 模式提供 test 面板
  - [x] 在新的线程中运行 test 指令,并将其 stdout/err 输出转储到 logger 面板
- [ ] 提供 build 指令
  > bfsp 的 build 指令，本质是输出 bfchain-system 所需的可执行文件
  > 但开发者可以提供自定义`profiles`，来做个性化编译，从而输出到 nodejs、browser 平台。
- [ ] 提供 npm 指令
  > 有三种子指令：`publish`/`pack`
  - [ ] 默认是`publish`，其行为与`learn publish`一致，需要 git 完全提交完毕，而后会根据变动信息，自动变更版本号。
  - [ ] `pack`指令是在`.npm`文件夹下打包出`.tgz`文件。如果有子项目，也会一并导出多个`.tgz`
- [ ] 多项目模式
  > 使用 yarn 支持 workspace 依赖
  > 那么将子项目的 tsconfig.json 文件一并合并进项目中做 tsc
  > 子项目同时启动 bundle，同步编译
  > 子项目会被排除出当前项目之外，只使用项目名称来进行引用
- [ ] 自举：bfsp 项目自身使用 bfsp 进行编译
