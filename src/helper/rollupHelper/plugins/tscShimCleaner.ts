import { Inject, Injectable, ModuleStroge, Resolve } from '@bfchain/util-dep-inject';
import { ROLLUP_PRIFILE_ARGS } from '../const';
import { PROFILE_SET } from '../../const';
import type { Plugin } from 'rollup';
import { PathHelper } from '../../pathHelper';
import { Reader } from '../../reader';
import { Logger } from '../../logger';

@Injectable()
export class RollupTscShimCleaner implements PKGM.RollupPlugin {
  readonly pluginName = 'tsc-shim-cleaner';
  private patterns = [
    {
      test: /var\s__decorate\s[\w\W]+?\};/,
      replace: '/*TS decorate*/',
      key: '__decorate',
      intro: `const __decorate = /* (this && this.__decorate) ||  */function (decorators, target, key, desc) {
        var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
        if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
        else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
        return c > 3 && r && Object.defineProperty(target, key, r), r;
    };`,
    },
    {
      test: /var\s__metadata\s[\w\W]+?\};/,
      replace: '/*TS metadata*/',
      key: '__metadata',
      intro: `const __metadata = /* (this && this.__metadata) || */ function (k, v) {
        if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
    };`,
    },
    {
      test: /var\s__param\s[\w\W]+?\};/,
      replace: '/*TS param*/',
      key: '__param',
      intro: `const __param = /* (this && this.__param) || */ function (paramIndex, decorator) {
        return function (target, key) { decorator(target, key, paramIndex); }
    };`,
    },
    {
      test: /var\s__awaiter\s[\w\W]+?\};/,
      replace: '/*TS awaiter*/',
      key: '__awaiter',
      intro: `const __awaiter = /* (this && this.__awaiter) ||  */ function (thisArg, _arguments, P, generator) {
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
      };`,
    },
    {
      test: /var\s__await\s[\w\W]+?\}/,
      replace: '/*TS await*/',
      key: '__await',
      intro: `const __await = /* (this && this.__await) || */ function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }`,
    },
    {
      test: /var\s__asyncGenerator\s[\w\W]+?\n\s*?\};/,
      replace: '/*TS asyncGenerator*/',
      key: '__asyncGenerator',
      intro: `const __asyncGenerator = /* (this && this.__asyncGenerator) || */ function (thisArg, _arguments, generator) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var g = generator.apply(thisArg, _arguments || []), i, q = [];
        return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
        function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
        function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
        function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
        function fulfill(value) { resume("next", value); }
        function reject(value) { resume("throw", value); }
        function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
    };`,
    },
    {
      test: /var\s__rest\s[\w\W]+?\n\s*?\};/,
      replace: '/*TS rest*/',
      key: '__rest',
      intro: `const __rest = /* (this && this.__rest) || */ function (s, e) {
        var t = {};
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            t[p] = s[p];
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    t[p[i]] = s[p[i]];
            }
        return t;
      };`,
    },
    {
      test: /var\s__asyncValues\s[\w\W]+?\n\s*?\};/,
      replace: '/*TS asyncValues*/',
      key: '__asyncValues',
      intro: `const __asyncValues = /* (this && this.__asyncValues) || */ function (o) {
        if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
        var m = o[Symbol.asyncIterator], i;
        return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
        function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
        function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
    };`,
    },
    {
      test: /var\s__asyncDelegator\s[\w\W]+?\n\s*?\};/,
      replace: '/*TS asyncDelegator*/',
      key: '__asyncDelegator',
      intro: `const __asyncDelegator = /* (this && this.__asyncDelegator) || */ function (o) {
        var i, p;
        return i = {}, verb("next"), verb("throw", function (e) { throw e; }), verb("return"), i[Symbol.iterator] = function () { return this; }, i;
        function verb(n, f) { i[n] = o[n] ? function (v) { return (p = !p) ? { value: __await(o[n](v)), done: n === "return" } : f ? f(v) : v; } : f; }
    };`,
    },
    {
      test: /var\s__generator\s[\w\W]+?\n\s*?\};/,
      replace: '/*TS generator*/',
      key: '__generator',
      intro: `const __generator = /* (this && this.__generator) || */ function (thisArg, body) {
        var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
        return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
        function verb(n) { return function (v) { return step([n, v]); }; }
        function step(op) {
            if (f) throw new TypeError("Generator is already executing.");
            while (_) try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
                if (y = 0, t) op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0: case 1: t = op; break;
                    case 4: _.label++; return { value: op[1], done: false };
                    case 5: _.label++; y = op[1]; op = [0]; continue;
                    case 7: op = _.ops.pop(); _.trys.pop(); continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                        if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                        if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                        if (t[2]) _.ops.pop();
                        _.trys.pop(); continue;
                }
                op = body.call(thisArg, _);
            } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
            if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
        }
      };`,
    },
    {
      test: /var\s__read\s[\w\W]+?\n\s*?\};/,
      replace: '/*TS read*/',
      key: '__read',
      intro: `const __read = /* (this && this.__read) || */ function (o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
            while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        }
        catch (error) { e = { error: error }; }
        finally {
            try {
                if (r && !r.done && (m = i["return"])) m.call(i);
            }
            finally { if (e) throw e.error; }
        }
        return ar;
    };`,
    },
    {
      test: /var\s__spread\s[\w\W]+?\n\s*?\};/,
      replace: '/*TS spread*/',
      key: '__spread',
      intro: `const __spread = /* (this && this.__spread) || */ function () {
        for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
        return ar;
    };`,
    },
    {
      test: /var\s__values\s[\w\W]+?.*?\n\};/,
      replace: '/*TS values*/',
      key: '__values',
      intro: `const __values = /* (this && this.__values) || */ function(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
            next: function () {
                if (o && i >= o.length) o = void 0;
                return { value: o && o[i++], done: !o };
            }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
    };`,
    },
    {
      test: /var\s__extends\s[\w\W]+?\n\s*?\}\)\(\);/,
      replace: '/*TS extends*/',
      key: '__extends',
      intro: `const __extends = /* (this && this.__extends) || */ (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();`,
    },
  ];
  toPlugin(): Plugin {
    const intros = new Set();
    return {
      name: this.pluginName,
      transform: (code, id) => {
        for (const pattern of this.patterns) {
          code = code.replace(pattern.test, () => {
            intros.add(pattern.intro);
            return pattern.replace;
          });
        }
        return code;
      },
      intro() {
        return [...intros.values()].join('\n');
      },
    };
  }
}
