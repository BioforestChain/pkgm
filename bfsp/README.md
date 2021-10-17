## Roadmap

- [x] typings 文件夹下的`.ts`文件, 以及任意文件夹下的`.type.ts`文件,都会全部被包含到 prod 项目中的 typings 文件夹下
- [x] bin 文件夹下, `.bin.ts` 后缀的文件自动变成出口文件,用于输出 package.json 的 bin 指令
- [x] tests 文件夹下,`.test.ts`后缀的文件自动变成出口文件,用于输出测试用的可执行文件,但不会跟着被发布出去
- [x] `bin/dev` 需要启动以下作业:
  - [x] 监听更新 typescript 相关的配置文件与自动生成的代码
- [x] 将 bin 输出到 package.json
- [ ] 提供`#{Profile}`模式
- [x] 提供 test 指令
  > 前期使用 ava 来作为测试功能的后端,只需要启动 ava/cli 即可
- [ ] 为 dev 模式提供 cmd 面板
  - [ ] 可以快速输入一些内置的指令与提示
    - [ ] test 提示测试模块的名字
    - [ ] fmt 提供格式化模式:diff/all;文件类型的提示:.ts/.json/.html 等
- [ ] 为 dev 模式提供 test 面板
  - [ ] 在新的线程中运行 test 指令,并将其 stdout/err 输出转储到 logger 面板
