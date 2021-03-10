import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { ROLLUP_PRIFILE_ARGS } from '../const';
import { PROFILE_SET } from '../../const';
import type { Plugin } from 'rollup';
import { PathHelper } from '../../pathHelper';
import { Reader } from '../../reader';
import { Logger } from '../../logger';

@Injectable()
export class RollupProfileSwitch implements PKGM.RollupPlugin {
  static ARGS = {
    ...ROLLUP_PRIFILE_ARGS,
  };
  static from(
    args: {
      jsRuntime?: RollupProfileSwitch['jsRuntime'];
      runtimeMode?: RollupProfileSwitch['runtimeMode'];
      platform?: RollupProfileSwitch['platform'];
      channel?: RollupProfileSwitch['channel'];
    },
    moduleMap = new ModuleStroge()
  ) {
    const ARGS = RollupProfileSwitch.ARGS;
    moduleMap.set(ARGS.JS_RUNTIME, args.jsRuntime);
    moduleMap.set(ARGS.RUNTIME_MODE, args.runtimeMode);
    moduleMap.set(ARGS.PLATFORM, args.platform);
    moduleMap.set(ARGS.CHANNEL, args.channel);
    return Resolve(RollupProfileSwitch, moduleMap);
  }
  readonly pluginName = 'profile-switch';
  constructor(
    @Inject(RollupProfileSwitch.ARGS.RUNTIME_MODE, { optional: true })
    public readonly runtimeMode: PKGM.Profile.RuntimeMode | undefined,
    @Inject(RollupProfileSwitch.ARGS.JS_RUNTIME, { optional: true })
    public readonly jsRuntime: PKGM.Profile.JsRuntime | undefined,
    @Inject(RollupProfileSwitch.ARGS.PLATFORM, { optional: true })
    public readonly platform: PKGM.Profile.Platform | undefined,
    @Inject(RollupProfileSwitch.ARGS.CHANNEL, { optional: true })
    public readonly channel: PKGM.Profile.Channel | undefined,
    private path: PathHelper,
    private reader: Reader,
    private logger: Logger
  ) {}

  private _parseId(id: string) {
    const idInfo = this.path.parse(id);
    const [baseName, ...profileList] = idInfo.name.split('.');
    const maybeProfiles = new Set(profileList);

    const finder = {
      jsRuntime: new ProfileFinder(PROFILE_SET.JS_RUNTIME),
      runtimeMode: new ProfileFinder(PROFILE_SET.RUNTIME_MODE),
      platform: new ProfileFinder(PROFILE_SET.PLATFORM),
      channel: new ProfileFinder(PROFILE_SET.CHANNEL),
    } as const;

    for (let maybeProfile of maybeProfiles) {
      let add = true;
      if (maybeProfile.startsWith('!')) {
        add = false;
        maybeProfile = maybeProfile.slice(1);
      }
      for (const name in finder) {
        const initer = finder[name as keyof typeof finder] as ProfileFinder<string>;
        const profile = initer.is(maybeProfile);
        if (profile !== undefined) {
          add ? initer.add(profile) : initer.remove(profile);
          maybeProfiles.delete(profile);
          break;
        }
      }
    }
    const name = baseName + (maybeProfiles.size === 0 ? '' : `.${[...maybeProfiles].join('.')}`);
    idInfo.name = name;
    idInfo.base = name + idInfo.ext;
    return {
      id,
      idInfo,
      finder,
    };
  }
  findMatchIdInList(sourceId: string, idList: string[]) {
    const parsedSourceId = this._parseId(sourceId);
    const parsedIdList = idList
      .map((id) => this._parseId(id))
      .filter(({ idInfo }) => idInfo.name === parsedSourceId.idInfo.name);

    /// 寻找最为匹配的
    for (const parsedId of parsedIdList) {
      if (
        parsedId.finder.jsRuntime.has(this.jsRuntime) &&
        parsedId.finder.runtimeMode.has(this.runtimeMode) &&
        parsedId.finder.platform.has(this.platform) &&
        parsedId.finder.channel.has(this.channel)
      ) {
        this.logger.debug(
          'found profile: %s => %s',
          this.logger.$.path(sourceId),
          this.logger.$.path(parsedId.id)
        );
        return parsedId.id;
      }
    }
    /// 没有找到最匹配的，只能返回默认
    return sourceId;
  }

  toPlugin(): Plugin {
    return {
      name: this.pluginName,
      load: (id) => {
        if (id.endsWith('.js')) {
          const idInfo = this.path.parse(id);
          const baseNamePrefix = idInfo.name.split('.')[0] + '.';
          const idList = this.reader.lsFiles(
            idInfo.dir,
            (filename) =>
              filename !== idInfo.base &&
              filename.startsWith(baseNamePrefix) &&
              filename.endsWith(idInfo.ext)
          );
          /// 自然加载
          if (idList.length > 0) {
            const findedId = this.findMatchIdInList(
              id,
              idList.map((id) => this.path.join(idInfo.dir, id))
            );
            if (findedId !== id) {
              return this.reader.readFile(findedId, 'utf-8');
            }
          }
        }
        return null;
      },
    };
  }
}
class ProfileFinder<T> {
  constructor(private full: Set<T>) {}
  private _profiles?: Set<T>;
  is(profile: unknown) {
    if (this.full.has(profile as any)) {
      return profile as T;
    }
  }
  add(profile: T) {
    if (this._profiles === undefined) {
      this._profiles = new Set();
    }
    this._profiles.add(profile);
  }
  private _tryToFullSet(profiles?: Set<T>) {
    if (profiles === undefined) {
      profiles = new Set(this.full);
    }
    return profiles;
  }
  remove(profile: T) {
    (this._profiles = this._tryToFullSet(this._profiles)).delete(profile);
  }
  has(profile: unknown) {
    const profiles = this._tryToFullSet(this._profiles);
    /// 没有指定某一个时，默认要求提供全部
    if (profile === undefined) {
      return profiles.size === this.full.size;
    }
    return profiles.has(profile as any);
  }
  //   toSet() {
  //     return this._tryToFullSet(this._profiles);
  //   }
}
