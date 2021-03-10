const JSBI__kMaxLength = 1 << 25;
const JSBI__kMaxLengthBits = JSBI__kMaxLength << 5;
const JSBI__kMaxBitsPerChar = [
    0, 0, 32, 51, 64, 75, 83, 90, 96,
    102, 107, 111, 115, 119, 122, 126, 128,
    131, 134, 136, 139, 141, 143, 145, 147,
    149, 151, 153, 154, 156, 158, 159, 160,
    162, 163, 165, 166,
];
const JSBI__kBitsPerCharTableShift = 5;
const JSBI__kBitsPerCharTableMultiplier = 1 << JSBI__kBitsPerCharTableShift;
const JSBI__kConversionChars = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
const JSBI__kBitConversionBuffer = new ArrayBuffer(8);
const JSBI__kBitConversionDouble = new Float64Array(JSBI__kBitConversionBuffer);
const JSBI__kBitConversionInts = new Int32Array(JSBI__kBitConversionBuffer);
class JSBI extends Array {
    constructor(length, sign) {
        if (length > JSBI__kMaxLength) {
            throw new RangeError('Maximum BigInt size exceeded');
        }
        super(length);
        this.sign = sign || false;
    }
    static BigInt(arg) {
        if (typeof arg === 'number') {
            if (arg === 0)
                return JSBI.__zero();
            if ((arg | 0) === arg) {
                if (arg < 0) {
                    return JSBI.__oneDigit(-arg, true);
                }
                return JSBI.__oneDigit(arg, false);
            }
            if (!Number.isFinite(arg) || Math.floor(arg) !== arg) {
                throw new RangeError('The number ' + arg + ' cannot be converted to ' + 'BigInt because it is not an integer');
            }
            return JSBI.__fromDouble(arg);
        }
        else if (typeof arg === 'string') {
            const result = JSBI.__fromString(arg);
            if (result === null) {
                throw new SyntaxError('Cannot convert ' + arg + ' to a BigInt');
            }
            return result;
        }
        else if (typeof arg === 'boolean') {
            if (arg === true) {
                return JSBI.__oneDigit(1, false);
            }
            return JSBI.__zero();
        }
        else if (typeof arg === 'object') {
            if (arg instanceof JSBI)
                return arg;
            const primitive = JSBI.__toPrimitive(arg);
            return JSBI.BigInt(primitive);
        }
        throw new TypeError('Cannot convert ' + arg + ' to a BigInt');
    }
    toDebugString() {
        const result = ['BigInt['];
        for (const digit of this) {
            result.push((digit ? (digit >>> 0).toString(16) : digit) + ', ');
        }
        result.push(']');
        return result.join('');
    }
    toString(radix = 10) {
        if (radix < 2 || radix > 36) {
            throw new RangeError('toString() radix argument must be between 2 and 36');
        }
        if (this.length === 0)
            return '0';
        if ((radix & (radix - 1)) === 0) {
            return JSBI.__toStringBasePowerOfTwo(this, radix);
        }
        return JSBI.__toStringGeneric(this, radix, false);
    }
    static toNumber(x) {
        const xLength = x.length;
        if (xLength === 0)
            return 0;
        if (xLength === 1) {
            const value = x.__unsignedDigit(0);
            return x.sign ? -value : value;
        }
        const xMsd = x.__digit(xLength - 1);
        const msdLeadingZeros = Math.clz32(xMsd);
        const xBitLength = xLength * 32 - msdLeadingZeros;
        if (xBitLength > 1024)
            return x.sign ? -Infinity : Infinity;
        let exponent = xBitLength - 1;
        let currentDigit = xMsd;
        let digitIndex = xLength - 1;
        const shift = msdLeadingZeros + 1;
        let mantissaHigh = shift === 32 ? 0 : currentDigit << shift;
        mantissaHigh >>>= 12;
        const mantissaHighBitsUnset = shift - 12;
        let mantissaLow = shift >= 12 ? 0 : currentDigit << (20 + shift);
        let mantissaLowBitsUnset = 20 + shift;
        if (mantissaHighBitsUnset > 0 && digitIndex > 0) {
            digitIndex--;
            currentDigit = x.__digit(digitIndex);
            mantissaHigh |= currentDigit >>> (32 - mantissaHighBitsUnset);
            mantissaLow = currentDigit << mantissaHighBitsUnset;
            mantissaLowBitsUnset = mantissaHighBitsUnset;
        }
        if (mantissaLowBitsUnset > 0 && digitIndex > 0) {
            digitIndex--;
            currentDigit = x.__digit(digitIndex);
            mantissaLow |= currentDigit >>> (32 - mantissaLowBitsUnset);
            mantissaLowBitsUnset -= 32;
        }
        const rounding = JSBI.__decideRounding(x, mantissaLowBitsUnset, digitIndex, currentDigit);
        if (rounding === 1 || (rounding === 0 && (mantissaLow & 1) === 1)) {
            mantissaLow = (mantissaLow + 1) >>> 0;
            if (mantissaLow === 0) {
                mantissaHigh++;
                if (mantissaHigh >>> 20 !== 0) {
                    mantissaHigh = 0;
                    exponent++;
                    if (exponent > 1023) {
                        return x.sign ? -Infinity : Infinity;
                    }
                }
            }
        }
        const signBit = x.sign ? 1 << 31 : 0;
        exponent = (exponent + 0x3ff) << 20;
        JSBI__kBitConversionInts[1] = signBit | exponent | mantissaHigh;
        JSBI__kBitConversionInts[0] = mantissaLow;
        return JSBI__kBitConversionDouble[0];
    }
    static unaryMinus(x) {
        if (x.length === 0)
            return x;
        const result = x.__copy();
        result.sign = !x.sign;
        return result;
    }
    static bitwiseNot(x) {
        if (x.sign) {
            return JSBI.__absoluteSubOne(x).__trim();
        }
        return JSBI.__absoluteAddOne(x, true);
    }
    static exponentiate(x, y) {
        if (y.sign) {
            throw new RangeError('Exponent must be positive');
        }
        if (y.length === 0) {
            return JSBI.__oneDigit(1, false);
        }
        if (x.length === 0)
            return x;
        if (x.length === 1 && x.__digit(0) === 1) {
            if (x.sign && (y.__digit(0) & 1) === 0) {
                return JSBI.unaryMinus(x);
            }
            return x;
        }
        if (y.length > 1)
            throw new RangeError('BigInt too big');
        let expValue = y.__unsignedDigit(0);
        if (expValue === 1)
            return x;
        if (expValue >= JSBI__kMaxLengthBits) {
            throw new RangeError('BigInt too big');
        }
        if (x.length === 1 && x.__digit(0) === 2) {
            const neededDigits = 1 + (expValue >>> 5);
            const sign = x.sign && (expValue & 1) !== 0;
            const result = new JSBI(neededDigits, sign);
            result.__initializeDigits();
            const msd = 1 << (expValue & 31);
            result.__setDigit(neededDigits - 1, msd);
            return result;
        }
        let result;
        let runningSquare = x;
        if ((expValue & 1) !== 0)
            result = x;
        expValue >>= 1;
        for (; expValue !== 0; expValue >>= 1) {
            runningSquare = JSBI.multiply(runningSquare, runningSquare);
            if ((expValue & 1) !== 0) {
                if (result === undefined) {
                    result = runningSquare;
                }
                else {
                    result = JSBI.multiply(result, runningSquare);
                }
            }
        }
        return result;
    }
    static multiply(x, y) {
        if (x.length === 0)
            return x;
        if (y.length === 0)
            return y;
        let resultLength = x.length + y.length;
        if (x.__clzmsd() + y.__clzmsd() >= 32) {
            resultLength--;
        }
        const result = new JSBI(resultLength, x.sign !== y.sign);
        result.__initializeDigits();
        for (let i = 0; i < x.length; i++) {
            JSBI.__multiplyAccumulate(y, x.__digit(i), result, i);
        }
        return result.__trim();
    }
    static divide(x, y) {
        if (y.length === 0)
            throw new RangeError('Division by zero');
        if (JSBI.__absoluteCompare(x, y) < 0)
            return JSBI.__zero();
        const resultSign = x.sign !== y.sign;
        const divisor = y.__unsignedDigit(0);
        let quotient;
        if (y.length === 1 && divisor <= 0xffff) {
            if (divisor === 1) {
                return resultSign === x.sign ? x : JSBI.unaryMinus(x);
            }
            quotient = JSBI.__absoluteDivSmall(x, divisor);
        }
        else {
            quotient = JSBI.__absoluteDivLarge(x, y, true, false);
        }
        quotient.sign = resultSign;
        return quotient.__trim();
    }
    static remainder(x, y) {
        if (y.length === 0)
            throw new RangeError('Division by zero');
        if (JSBI.__absoluteCompare(x, y) < 0)
            return x;
        const divisor = y.__unsignedDigit(0);
        if (y.length === 1 && divisor <= 0xffff) {
            if (divisor === 1)
                return JSBI.__zero();
            const remainderDigit = JSBI.__absoluteModSmall(x, divisor);
            if (remainderDigit === 0)
                return JSBI.__zero();
            return JSBI.__oneDigit(remainderDigit, x.sign);
        }
        const remainder = JSBI.__absoluteDivLarge(x, y, false, true);
        remainder.sign = x.sign;
        return remainder.__trim();
    }
    static add(x, y) {
        const sign = x.sign;
        if (sign === y.sign) {
            return JSBI.__absoluteAdd(x, y, sign);
        }
        if (JSBI.__absoluteCompare(x, y) >= 0) {
            return JSBI.__absoluteSub(x, y, sign);
        }
        return JSBI.__absoluteSub(y, x, !sign);
    }
    static subtract(x, y) {
        const sign = x.sign;
        if (sign !== y.sign) {
            return JSBI.__absoluteAdd(x, y, sign);
        }
        if (JSBI.__absoluteCompare(x, y) >= 0) {
            return JSBI.__absoluteSub(x, y, sign);
        }
        return JSBI.__absoluteSub(y, x, !sign);
    }
    static leftShift(x, y) {
        if (y.length === 0 || x.length === 0)
            return x;
        if (y.sign)
            return JSBI.__rightShiftByAbsolute(x, y);
        return JSBI.__leftShiftByAbsolute(x, y);
    }
    static signedRightShift(x, y) {
        if (y.length === 0 || x.length === 0)
            return x;
        if (y.sign)
            return JSBI.__leftShiftByAbsolute(x, y);
        return JSBI.__rightShiftByAbsolute(x, y);
    }
    static unsignedRightShift() {
        throw new TypeError('BigInts have no unsigned right shift; use >> instead');
    }
    static lessThan(x, y) {
        return JSBI.__compareToBigInt(x, y) < 0;
    }
    static lessThanOrEqual(x, y) {
        return JSBI.__compareToBigInt(x, y) <= 0;
    }
    static greaterThan(x, y) {
        return JSBI.__compareToBigInt(x, y) > 0;
    }
    static greaterThanOrEqual(x, y) {
        return JSBI.__compareToBigInt(x, y) >= 0;
    }
    static equal(x, y) {
        if (x.sign !== y.sign)
            return false;
        if (x.length !== y.length)
            return false;
        for (let i = 0; i < x.length; i++) {
            if (x.__digit(i) !== y.__digit(i))
                return false;
        }
        return true;
    }
    static notEqual(x, y) {
        return !JSBI.equal(x, y);
    }
    static bitwiseAnd(x, y) {
        if (!x.sign && !y.sign) {
            return JSBI.__absoluteAnd(x, y).__trim();
        }
        else if (x.sign && y.sign) {
            const resultLength = Math.max(x.length, y.length) + 1;
            let result = JSBI.__absoluteSubOne(x, resultLength);
            const y1 = JSBI.__absoluteSubOne(y);
            result = JSBI.__absoluteOr(result, y1, result);
            return JSBI.__absoluteAddOne(result, true, result).__trim();
        }
        if (x.sign) {
            [x, y] = [y, x];
        }
        return JSBI.__absoluteAndNot(x, JSBI.__absoluteSubOne(y)).__trim();
    }
    static bitwiseXor(x, y) {
        if (!x.sign && !y.sign) {
            return JSBI.__absoluteXor(x, y).__trim();
        }
        else if (x.sign && y.sign) {
            const resultLength = Math.max(x.length, y.length);
            const result = JSBI.__absoluteSubOne(x, resultLength);
            const y1 = JSBI.__absoluteSubOne(y);
            return JSBI.__absoluteXor(result, y1, result).__trim();
        }
        const resultLength = Math.max(x.length, y.length) + 1;
        if (x.sign) {
            [x, y] = [y, x];
        }
        let result = JSBI.__absoluteSubOne(y, resultLength);
        result = JSBI.__absoluteXor(result, x, result);
        return JSBI.__absoluteAddOne(result, true, result).__trim();
    }
    static bitwiseOr(x, y) {
        const resultLength = Math.max(x.length, y.length);
        if (!x.sign && !y.sign) {
            return JSBI.__absoluteOr(x, y).__trim();
        }
        else if (x.sign && y.sign) {
            let result = JSBI.__absoluteSubOne(x, resultLength);
            const y1 = JSBI.__absoluteSubOne(y);
            result = JSBI.__absoluteAnd(result, y1, result);
            return JSBI.__absoluteAddOne(result, true, result).__trim();
        }
        if (x.sign) {
            [x, y] = [y, x];
        }
        let result = JSBI.__absoluteSubOne(y, resultLength);
        result = JSBI.__absoluteAndNot(result, x, result);
        return JSBI.__absoluteAddOne(result, true, result).__trim();
    }
    static asIntN(n, x) {
        if (x.length === 0)
            return x;
        if (n === 0)
            return JSBI.__zero();
        if (n >= JSBI__kMaxLengthBits)
            return x;
        const neededLength = (n + 31) >>> 5;
        if (x.length < neededLength)
            return x;
        const topDigit = x.__unsignedDigit(neededLength - 1);
        const compareDigit = 1 << ((n - 1) & 31);
        if (x.length === neededLength && topDigit < compareDigit)
            return x;
        const hasBit = (topDigit & compareDigit) === compareDigit;
        if (!hasBit)
            return JSBI.__truncateToNBits(n, x);
        if (!x.sign)
            return JSBI.__truncateAndSubFromPowerOfTwo(n, x, true);
        if ((topDigit & (compareDigit - 1)) === 0) {
            for (let i = neededLength - 2; i >= 0; i--) {
                if (x.__digit(i) !== 0) {
                    return JSBI.__truncateAndSubFromPowerOfTwo(n, x, false);
                }
            }
            if (x.length === neededLength && topDigit === compareDigit)
                return x;
            return JSBI.__truncateToNBits(n, x);
        }
        return JSBI.__truncateAndSubFromPowerOfTwo(n, x, false);
    }
    static asUintN(n, x) {
        if (x.length === 0)
            return x;
        if (n === 0)
            return JSBI.__zero();
        if (x.sign) {
            if (n > JSBI__kMaxLengthBits) {
                throw new RangeError('BigInt too big');
            }
            return JSBI.__truncateAndSubFromPowerOfTwo(n, x, false);
        }
        if (n >= JSBI__kMaxLengthBits)
            return x;
        const neededLength = (n + 31) >>> 5;
        if (x.length < neededLength)
            return x;
        const bitsInTopDigit = n & 31;
        if (x.length == neededLength) {
            if (bitsInTopDigit === 0)
                return x;
            const topDigit = x.__digit(neededLength - 1);
            if (topDigit >>> bitsInTopDigit === 0)
                return x;
        }
        return JSBI.__truncateToNBits(n, x);
    }
    static ADD(x, y) {
        x = JSBI.__toPrimitive(x);
        y = JSBI.__toPrimitive(y);
        if (typeof x === 'string') {
            if (typeof y !== 'string')
                y = y.toString();
            return x + y;
        }
        if (typeof y === 'string') {
            return x.toString() + y;
        }
        x = JSBI.__toNumeric(x);
        y = JSBI.__toNumeric(y);
        if (JSBI.__isBigInt(x) && JSBI.__isBigInt(y)) {
            return JSBI.add(x, y);
        }
        if (typeof x === 'number' && typeof y === 'number') {
            return x + y;
        }
        throw new TypeError('Cannot mix BigInt and other types, use explicit conversions');
    }
    static LT(x, y) {
        return JSBI.__compare(x, y, 0);
    }
    static LE(x, y) {
        return JSBI.__compare(x, y, 1);
    }
    static GT(x, y) {
        return JSBI.__compare(x, y, 2);
    }
    static GE(x, y) {
        return JSBI.__compare(x, y, 3);
    }
    static EQ(x, y) {
        while (true) {
            if (JSBI.__isBigInt(x)) {
                if (JSBI.__isBigInt(y))
                    return JSBI.equal(x, y);
                return JSBI.EQ(y, x);
            }
            else if (typeof x === 'number') {
                if (JSBI.__isBigInt(y))
                    return JSBI.__equalToNumber(y, x);
                if (typeof y !== 'object')
                    return x == y;
                y = JSBI.__toPrimitive(y);
            }
            else if (typeof x === 'string') {
                if (JSBI.__isBigInt(y)) {
                    x = JSBI.__fromString(x);
                    if (x === null)
                        return false;
                    return JSBI.equal(x, y);
                }
                if (typeof y !== 'object')
                    return x == y;
                y = JSBI.__toPrimitive(y);
            }
            else if (typeof x === 'boolean') {
                if (JSBI.__isBigInt(y))
                    return JSBI.__equalToNumber(y, +x);
                if (typeof y !== 'object')
                    return x == y;
                y = JSBI.__toPrimitive(y);
            }
            else if (typeof x === 'symbol') {
                if (JSBI.__isBigInt(y))
                    return false;
                if (typeof y !== 'object')
                    return x == y;
                y = JSBI.__toPrimitive(y);
            }
            else if (typeof x === 'object') {
                if (typeof y === 'object' && !(y instanceof JSBI))
                    return x == y;
                x = JSBI.__toPrimitive(x);
            }
            else {
                return x == y;
            }
        }
    }
    static NE(x, y) {
        return !JSBI.EQ(x, y);
    }
    static __zero() {
        return new JSBI(0, false);
    }
    static __oneDigit(value, sign) {
        const result = new JSBI(1, sign);
        result.__setDigit(0, value);
        return result;
    }
    __copy() {
        const result = new JSBI(this.length, this.sign);
        for (let i = 0; i < this.length; i++) {
            result[i] = this[i];
        }
        return result;
    }
    __trim() {
        let newLength = this.length;
        let last = this[newLength - 1];
        while (last === 0) {
            newLength--;
            last = this[newLength - 1];
            this.pop();
        }
        if (newLength === 0)
            this.sign = false;
        return this;
    }
    __initializeDigits() {
        for (let i = 0; i < this.length; i++) {
            this[i] = 0;
        }
    }
    static __decideRounding(x, mantissaBitsUnset, digitIndex, currentDigit) {
        if (mantissaBitsUnset > 0)
            return -1;
        let topUnconsumedBit;
        if (mantissaBitsUnset < 0) {
            topUnconsumedBit = -mantissaBitsUnset - 1;
        }
        else {
            if (digitIndex === 0)
                return -1;
            digitIndex--;
            currentDigit = x.__digit(digitIndex);
            topUnconsumedBit = 31;
        }
        let mask = 1 << topUnconsumedBit;
        if ((currentDigit & mask) === 0)
            return -1;
        mask -= 1;
        if ((currentDigit & mask) !== 0)
            return 1;
        while (digitIndex > 0) {
            digitIndex--;
            if (x.__digit(digitIndex) !== 0)
                return 1;
        }
        return 0;
    }
    static __fromDouble(value) {
        const sign = value < 0;
        JSBI__kBitConversionDouble[0] = value;
        const rawExponent = (JSBI__kBitConversionInts[1] >>> 20) & 0x7ff;
        const exponent = rawExponent - 0x3ff;
        const digits = (exponent >>> 5) + 1;
        const result = new JSBI(digits, sign);
        const kHiddenBit = 0x00100000;
        let mantissaHigh = (JSBI__kBitConversionInts[1] & 0xfffff) | kHiddenBit;
        let mantissaLow = JSBI__kBitConversionInts[0];
        const kMantissaHighTopBit = 20;
        const msdTopBit = exponent & 31;
        let remainingMantissaBits = 0;
        let digit;
        if (msdTopBit < kMantissaHighTopBit) {
            const shift = kMantissaHighTopBit - msdTopBit;
            remainingMantissaBits = shift + 32;
            digit = mantissaHigh >>> shift;
            mantissaHigh = (mantissaHigh << (32 - shift)) | (mantissaLow >>> shift);
            mantissaLow = mantissaLow << (32 - shift);
        }
        else if (msdTopBit === kMantissaHighTopBit) {
            remainingMantissaBits = 32;
            digit = mantissaHigh;
            mantissaHigh = mantissaLow;
        }
        else {
            const shift = msdTopBit - kMantissaHighTopBit;
            remainingMantissaBits = 32 - shift;
            digit = (mantissaHigh << shift) | (mantissaLow >>> (32 - shift));
            mantissaHigh = mantissaLow << shift;
        }
        result.__setDigit(digits - 1, digit);
        for (let digitIndex = digits - 2; digitIndex >= 0; digitIndex--) {
            if (remainingMantissaBits > 0) {
                remainingMantissaBits -= 32;
                digit = mantissaHigh;
                mantissaHigh = mantissaLow;
            }
            else {
                digit = 0;
            }
            result.__setDigit(digitIndex, digit);
        }
        return result.__trim();
    }
    static __isWhitespace(c) {
        if (c <= 0x0d && c >= 0x09)
            return true;
        if (c <= 0x9f)
            return c === 0x20;
        if (c <= 0x01ffff) {
            return c === 0xa0 || c === 0x1680;
        }
        if (c <= 0x02ffff) {
            c &= 0x01ffff;
            return c <= 0x0a || c === 0x28 || c === 0x29 || c === 0x2f || c === 0x5f || c === 0x1000;
        }
        return c === 0xfeff;
    }
    static __fromString(string, radix = 0) {
        let sign = 0;
        let leadingZero = false;
        const length = string.length;
        let cursor = 0;
        if (cursor === length)
            return JSBI.__zero();
        let current = string.charCodeAt(cursor);
        while (JSBI.__isWhitespace(current)) {
            if (++cursor === length)
                return JSBI.__zero();
            current = string.charCodeAt(cursor);
        }
        if (current === 0x2b) {
            if (++cursor === length)
                return null;
            current = string.charCodeAt(cursor);
            sign = 1;
        }
        else if (current === 0x2d) {
            if (++cursor === length)
                return null;
            current = string.charCodeAt(cursor);
            sign = -1;
        }
        if (radix === 0) {
            radix = 10;
            if (current === 0x30) {
                if (++cursor === length)
                    return JSBI.__zero();
                current = string.charCodeAt(cursor);
                if (current === 0x58 || current === 0x78) {
                    radix = 16;
                    if (++cursor === length)
                        return null;
                    current = string.charCodeAt(cursor);
                }
                else if (current === 0x4f || current === 0x6f) {
                    radix = 8;
                    if (++cursor === length)
                        return null;
                    current = string.charCodeAt(cursor);
                }
                else if (current === 0x42 || current === 0x62) {
                    radix = 2;
                    if (++cursor === length)
                        return null;
                    current = string.charCodeAt(cursor);
                }
                else {
                    leadingZero = true;
                }
            }
        }
        else if (radix === 16) {
            if (current === 0x30) {
                if (++cursor === length)
                    return JSBI.__zero();
                current = string.charCodeAt(cursor);
                if (current === 0x58 || current === 0x78) {
                    if (++cursor === length)
                        return null;
                    current = string.charCodeAt(cursor);
                }
                else {
                    leadingZero = true;
                }
            }
        }
        while (current === 0x30) {
            leadingZero = true;
            if (++cursor === length)
                return JSBI.__zero();
            current = string.charCodeAt(cursor);
        }
        const chars = length - cursor;
        let bitsPerChar = JSBI__kMaxBitsPerChar[radix];
        let roundup = JSBI__kBitsPerCharTableMultiplier - 1;
        if (chars > (1 << 30) / bitsPerChar)
            return null;
        const bitsMin = (bitsPerChar * chars + roundup) >>> JSBI__kBitsPerCharTableShift;
        const resultLength = (bitsMin + 31) >>> 5;
        const result = new JSBI(resultLength, false);
        const limDigit = radix < 10 ? radix : 10;
        const limAlpha = radix > 10 ? radix - 10 : 0;
        if ((radix & (radix - 1)) === 0) {
            bitsPerChar >>= JSBI__kBitsPerCharTableShift;
            const parts = [];
            const partsBits = [];
            let done = false;
            do {
                let part = 0;
                let bits = 0;
                while (true) {
                    let d;
                    if ((current - 48) >>> 0 < limDigit) {
                        d = current - 48;
                    }
                    else if (((current | 32) - 97) >>> 0 < limAlpha) {
                        d = (current | 32) - 87;
                    }
                    else {
                        done = true;
                        break;
                    }
                    bits += bitsPerChar;
                    part = (part << bitsPerChar) | d;
                    if (++cursor === length) {
                        done = true;
                        break;
                    }
                    current = string.charCodeAt(cursor);
                    if (bits + bitsPerChar > 32)
                        break;
                }
                parts.push(part);
                partsBits.push(bits);
            } while (!done);
            JSBI.__fillFromParts(result, parts, partsBits);
        }
        else {
            result.__initializeDigits();
            let done = false;
            let charsSoFar = 0;
            do {
                let part = 0;
                let multiplier = 1;
                while (true) {
                    let d;
                    if ((current - 48) >>> 0 < limDigit) {
                        d = current - 48;
                    }
                    else if (((current | 32) - 97) >>> 0 < limAlpha) {
                        d = (current | 32) - 87;
                    }
                    else {
                        done = true;
                        break;
                    }
                    const m = multiplier * radix;
                    if (m > 0xffffffff)
                        break;
                    multiplier = m;
                    part = part * radix + d;
                    charsSoFar++;
                    if (++cursor === length) {
                        done = true;
                        break;
                    }
                    current = string.charCodeAt(cursor);
                }
                roundup = JSBI__kBitsPerCharTableMultiplier * 32 - 1;
                const digitsSoFar = (bitsPerChar * charsSoFar + roundup) >>> (JSBI__kBitsPerCharTableShift + 5);
                result.__inplaceMultiplyAdd(multiplier, part, digitsSoFar);
            } while (!done);
        }
        if (cursor !== length) {
            if (!JSBI.__isWhitespace(current))
                return null;
            for (cursor++; cursor < length; cursor++) {
                current = string.charCodeAt(cursor);
                if (!JSBI.__isWhitespace(current))
                    return null;
            }
        }
        if (sign !== 0 && radix !== 10)
            return null;
        result.sign = sign === -1;
        return result.__trim();
    }
    static __fillFromParts(result, parts, partsBits) {
        let digitIndex = 0;
        let digit = 0;
        let bitsInDigit = 0;
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            const partBits = partsBits[i];
            digit |= part << bitsInDigit;
            bitsInDigit += partBits;
            if (bitsInDigit === 32) {
                result.__setDigit(digitIndex++, digit);
                bitsInDigit = 0;
                digit = 0;
            }
            else if (bitsInDigit > 32) {
                result.__setDigit(digitIndex++, digit);
                bitsInDigit -= 32;
                digit = part >>> (partBits - bitsInDigit);
            }
        }
        if (digit !== 0) {
            if (digitIndex >= result.length)
                throw new Error('implementation bug');
            result.__setDigit(digitIndex++, digit);
        }
        for (; digitIndex < result.length; digitIndex++) {
            result.__setDigit(digitIndex, 0);
        }
    }
    static __toStringBasePowerOfTwo(x, radix) {
        const length = x.length;
        let bits = radix - 1;
        bits = ((bits >>> 1) & 0x55) + (bits & 0x55);
        bits = ((bits >>> 2) & 0x33) + (bits & 0x33);
        bits = ((bits >>> 4) & 0x0f) + (bits & 0x0f);
        const bitsPerChar = bits;
        const charMask = radix - 1;
        const msd = x.__digit(length - 1);
        const msdLeadingZeros = Math.clz32(msd);
        const bitLength = length * 32 - msdLeadingZeros;
        let charsRequired = ((bitLength + bitsPerChar - 1) / bitsPerChar) | 0;
        if (x.sign)
            charsRequired++;
        if (charsRequired > 1 << 28)
            throw new Error('string too long');
        const result = new Array(charsRequired);
        let pos = charsRequired - 1;
        let digit = 0;
        let availableBits = 0;
        for (let i = 0; i < length - 1; i++) {
            const newDigit = x.__digit(i);
            const current = (digit | (newDigit << availableBits)) & charMask;
            result[pos--] = JSBI__kConversionChars[current];
            const consumedBits = bitsPerChar - availableBits;
            digit = newDigit >>> consumedBits;
            availableBits = 32 - consumedBits;
            while (availableBits >= bitsPerChar) {
                result[pos--] = JSBI__kConversionChars[digit & charMask];
                digit >>>= bitsPerChar;
                availableBits -= bitsPerChar;
            }
        }
        const current = (digit | (msd << availableBits)) & charMask;
        result[pos--] = JSBI__kConversionChars[current];
        digit = msd >>> (bitsPerChar - availableBits);
        while (digit !== 0) {
            result[pos--] = JSBI__kConversionChars[digit & charMask];
            digit >>>= bitsPerChar;
        }
        if (x.sign)
            result[pos--] = '-';
        if (pos !== -1)
            throw new Error('implementation bug');
        return result.join('');
    }
    static __toStringGeneric(x, radix, isRecursiveCall) {
        const length = x.length;
        if (length === 0)
            return '';
        if (length === 1) {
            let result = x.__unsignedDigit(0).toString(radix);
            if (isRecursiveCall === false && x.sign) {
                result = '-' + result;
            }
            return result;
        }
        const bitLength = length * 32 - Math.clz32(x.__digit(length - 1));
        const maxBitsPerChar = JSBI__kMaxBitsPerChar[radix];
        const minBitsPerChar = maxBitsPerChar - 1;
        let charsRequired = bitLength * JSBI__kBitsPerCharTableMultiplier;
        charsRequired += minBitsPerChar - 1;
        charsRequired = (charsRequired / minBitsPerChar) | 0;
        const secondHalfChars = (charsRequired + 1) >> 1;
        const conqueror = JSBI.exponentiate(JSBI.__oneDigit(radix, false), JSBI.__oneDigit(secondHalfChars, false));
        let quotient;
        let secondHalf;
        const divisor = conqueror.__unsignedDigit(0);
        if (conqueror.length === 1 && divisor <= 0xffff) {
            quotient = new JSBI(x.length, false);
            quotient.__initializeDigits();
            let remainder = 0;
            for (let i = x.length * 2 - 1; i >= 0; i--) {
                const input = (remainder << 16) | x.__halfDigit(i);
                quotient.__setHalfDigit(i, (input / divisor) | 0);
                remainder = input % divisor | 0;
            }
            secondHalf = remainder.toString(radix);
        }
        else {
            const divisionResult = JSBI.__absoluteDivLarge(x, conqueror, true, true);
            quotient = divisionResult.quotient;
            const remainder = divisionResult.remainder.__trim();
            secondHalf = JSBI.__toStringGeneric(remainder, radix, true);
        }
        quotient.__trim();
        let firstHalf = JSBI.__toStringGeneric(quotient, radix, true);
        while (secondHalf.length < secondHalfChars) {
            secondHalf = '0' + secondHalf;
        }
        if (isRecursiveCall === false && x.sign) {
            firstHalf = '-' + firstHalf;
        }
        return firstHalf + secondHalf;
    }
    static __unequalSign(leftNegative) {
        return leftNegative ? -1 : 1;
    }
    static __absoluteGreater(bothNegative) {
        return bothNegative ? -1 : 1;
    }
    static __absoluteLess(bothNegative) {
        return bothNegative ? 1 : -1;
    }
    static __compareToBigInt(x, y) {
        const xSign = x.sign;
        if (xSign !== y.sign)
            return JSBI.__unequalSign(xSign);
        const result = JSBI.__absoluteCompare(x, y);
        if (result > 0)
            return JSBI.__absoluteGreater(xSign);
        if (result < 0)
            return JSBI.__absoluteLess(xSign);
        return 0;
    }
    static __compareToNumber(x, y) {
        if ((y | 0) === 0) {
            const xSign = x.sign;
            const ySign = y < 0;
            if (xSign !== ySign)
                return JSBI.__unequalSign(xSign);
            if (x.length === 0) {
                if (ySign)
                    throw new Error('implementation bug');
                return y === 0 ? 0 : -1;
            }
            if (x.length > 1)
                return JSBI.__absoluteGreater(xSign);
            const yAbs = Math.abs(y);
            const xDigit = x.__unsignedDigit(0);
            if (xDigit > yAbs)
                return JSBI.__absoluteGreater(xSign);
            if (xDigit < yAbs)
                return JSBI.__absoluteLess(xSign);
            return 0;
        }
        return JSBI.__compareToDouble(x, y);
    }
    static __compareToDouble(x, y) {
        if (y !== y)
            return y;
        if (y === Infinity)
            return -1;
        if (y === -Infinity)
            return 1;
        const xSign = x.sign;
        const ySign = y < 0;
        if (xSign !== ySign)
            return JSBI.__unequalSign(xSign);
        if (y === 0) {
            throw new Error('implementation bug: should be handled elsewhere');
        }
        if (x.length === 0)
            return -1;
        JSBI__kBitConversionDouble[0] = y;
        const rawExponent = (JSBI__kBitConversionInts[1] >>> 20) & 0x7ff;
        if (rawExponent === 0x7ff) {
            throw new Error('implementation bug: handled elsewhere');
        }
        const exponent = rawExponent - 0x3ff;
        if (exponent < 0) {
            return JSBI.__absoluteGreater(xSign);
        }
        const xLength = x.length;
        let xMsd = x.__digit(xLength - 1);
        const msdLeadingZeros = Math.clz32(xMsd);
        const xBitLength = xLength * 32 - msdLeadingZeros;
        const yBitLength = exponent + 1;
        if (xBitLength < yBitLength)
            return JSBI.__absoluteLess(xSign);
        if (xBitLength > yBitLength)
            return JSBI.__absoluteGreater(xSign);
        const kHiddenBit = 0x00100000;
        let mantissaHigh = (JSBI__kBitConversionInts[1] & 0xfffff) | kHiddenBit;
        let mantissaLow = JSBI__kBitConversionInts[0];
        const kMantissaHighTopBit = 20;
        const msdTopBit = 31 - msdLeadingZeros;
        if (msdTopBit !== (xBitLength - 1) % 31) {
            throw new Error('implementation bug');
        }
        let compareMantissa;
        let remainingMantissaBits = 0;
        if (msdTopBit < kMantissaHighTopBit) {
            const shift = kMantissaHighTopBit - msdTopBit;
            remainingMantissaBits = shift + 32;
            compareMantissa = mantissaHigh >>> shift;
            mantissaHigh = (mantissaHigh << (32 - shift)) | (mantissaLow >>> shift);
            mantissaLow = mantissaLow << (32 - shift);
        }
        else if (msdTopBit === kMantissaHighTopBit) {
            remainingMantissaBits = 32;
            compareMantissa = mantissaHigh;
            mantissaHigh = mantissaLow;
        }
        else {
            const shift = msdTopBit - kMantissaHighTopBit;
            remainingMantissaBits = 32 - shift;
            compareMantissa = (mantissaHigh << shift) | (mantissaLow >>> (32 - shift));
            mantissaHigh = mantissaLow << shift;
        }
        xMsd = xMsd >>> 0;
        compareMantissa = compareMantissa >>> 0;
        if (xMsd > compareMantissa)
            return JSBI.__absoluteGreater(xSign);
        if (xMsd < compareMantissa)
            return JSBI.__absoluteLess(xSign);
        for (let digitIndex = xLength - 2; digitIndex >= 0; digitIndex--) {
            if (remainingMantissaBits > 0) {
                remainingMantissaBits -= 32;
                compareMantissa = mantissaHigh >>> 0;
                mantissaHigh = mantissaLow;
                mantissaLow = 0;
            }
            else {
                compareMantissa = 0;
            }
            const digit = x.__unsignedDigit(digitIndex);
            if (digit > compareMantissa)
                return JSBI.__absoluteGreater(xSign);
            if (digit < compareMantissa)
                return JSBI.__absoluteLess(xSign);
        }
        if (mantissaHigh !== 0 || mantissaLow !== 0) {
            if (remainingMantissaBits === 0)
                throw new Error('implementation bug');
            return JSBI.__absoluteLess(xSign);
        }
        return 0;
    }
    static __equalToNumber(x, y) {
        if ((y | 0) === y) {
            if (y === 0)
                return x.length === 0;
            return x.length === 1 && x.sign === y < 0 && x.__unsignedDigit(0) === Math.abs(y);
        }
        return JSBI.__compareToDouble(x, y) === 0;
    }
    static __comparisonResultToBool(result, op) {
        switch (op) {
            case 0:
                return result < 0;
            case 1:
                return result <= 0;
            case 2:
                return result > 0;
            case 3:
                return result >= 0;
        }
        throw new Error('unreachable');
    }
    static __compare(x, y, op) {
        x = JSBI.__toPrimitive(x);
        y = JSBI.__toPrimitive(y);
        if (typeof x === 'string' && typeof y === 'string') {
            switch (op) {
                case 0:
                    return x < y;
                case 1:
                    return x <= y;
                case 2:
                    return x > y;
                case 3:
                    return x >= y;
            }
        }
        if (JSBI.__isBigInt(x) && typeof y === 'string') {
            y = JSBI.__fromString(y);
            if (y === null)
                return false;
            return JSBI.__comparisonResultToBool(JSBI.__compareToBigInt(x, y), op);
        }
        if (typeof x === 'string' && JSBI.__isBigInt(y)) {
            x = JSBI.__fromString(x);
            if (x === null)
                return false;
            return JSBI.__comparisonResultToBool(JSBI.__compareToBigInt(x, y), op);
        }
        x = JSBI.__toNumeric(x);
        y = JSBI.__toNumeric(y);
        if (JSBI.__isBigInt(x)) {
            if (JSBI.__isBigInt(y)) {
                return JSBI.__comparisonResultToBool(JSBI.__compareToBigInt(x, y), op);
            }
            if (typeof y !== 'number')
                throw new Error('implementation bug');
            return JSBI.__comparisonResultToBool(JSBI.__compareToNumber(x, y), op);
        }
        if (typeof x !== 'number')
            throw new Error('implementation bug');
        if (JSBI.__isBigInt(y)) {
            return JSBI.__comparisonResultToBool(JSBI.__compareToNumber(y, x), op ^ 2);
        }
        if (typeof y !== 'number')
            throw new Error('implementation bug');
        switch (op) {
            case 0:
                return x < y;
            case 1:
                return x <= y;
            case 2:
                return x > y;
            case 3:
                return x >= y;
        }
    }
    __clzmsd() {
        return Math.clz32(this[this.length - 1]);
    }
    static __absoluteAdd(x, y, resultSign) {
        if (x.length < y.length)
            return JSBI.__absoluteAdd(y, x, resultSign);
        if (x.length === 0)
            return x;
        if (y.length === 0)
            return x.sign === resultSign ? x : JSBI.unaryMinus(x);
        let resultLength = x.length;
        if (x.__clzmsd() === 0 || (y.length === x.length && y.__clzmsd() === 0)) {
            resultLength++;
        }
        const result = new JSBI(resultLength, resultSign);
        let carry = 0;
        let i = 0;
        for (; i < y.length; i++) {
            const yDigit = y.__digit(i);
            const xDigit = x.__digit(i);
            const rLow = (xDigit & 0xffff) + (yDigit & 0xffff) + carry;
            const rHigh = (xDigit >>> 16) + (yDigit >>> 16) + (rLow >>> 16);
            carry = rHigh >>> 16;
            result.__setDigit(i, (rLow & 0xffff) | (rHigh << 16));
        }
        for (; i < x.length; i++) {
            const xDigit = x.__digit(i);
            const rLow = (xDigit & 0xffff) + carry;
            const rHigh = (xDigit >>> 16) + (rLow >>> 16);
            carry = rHigh >>> 16;
            result.__setDigit(i, (rLow & 0xffff) | (rHigh << 16));
        }
        if (i < result.length) {
            result.__setDigit(i, carry);
        }
        return result.__trim();
    }
    static __absoluteSub(x, y, resultSign) {
        if (x.length === 0)
            return x;
        if (y.length === 0)
            return x.sign === resultSign ? x : JSBI.unaryMinus(x);
        const result = new JSBI(x.length, resultSign);
        let borrow = 0;
        let i = 0;
        for (; i < y.length; i++) {
            const xDigit = x.__digit(i);
            const yDigit = y.__digit(i);
            const rLow = (xDigit & 0xffff) - (yDigit & 0xffff) - borrow;
            borrow = (rLow >>> 16) & 1;
            const rHigh = (xDigit >>> 16) - (yDigit >>> 16) - borrow;
            borrow = (rHigh >>> 16) & 1;
            result.__setDigit(i, (rLow & 0xffff) | (rHigh << 16));
        }
        for (; i < x.length; i++) {
            const xDigit = x.__digit(i);
            const rLow = (xDigit & 0xffff) - borrow;
            borrow = (rLow >>> 16) & 1;
            const rHigh = (xDigit >>> 16) - borrow;
            borrow = (rHigh >>> 16) & 1;
            result.__setDigit(i, (rLow & 0xffff) | (rHigh << 16));
        }
        return result.__trim();
    }
    static __absoluteAddOne(x, sign, result) {
        const inputLength = x.length;
        if (result === undefined) {
            result = new JSBI(inputLength, sign);
        }
        else {
            result.sign = sign;
        }
        let carry = true;
        for (let i = 0; i < inputLength; i++) {
            let digit = x.__digit(i);
            if (carry) {
                const newCarry = digit === (0xffffffff | 0);
                digit = (digit + 1) | 0;
                carry = newCarry;
            }
            result.__setDigit(i, digit);
        }
        if (carry) {
            result.__setDigitGrow(inputLength, 1);
        }
        return result;
    }
    static __absoluteSubOne(x, resultLength) {
        const length = x.length;
        resultLength = resultLength || length;
        const result = new JSBI(resultLength, false);
        let borrow = true;
        for (let i = 0; i < length; i++) {
            let digit = x.__digit(i);
            if (borrow) {
                const newBorrow = digit === 0;
                digit = (digit - 1) | 0;
                borrow = newBorrow;
            }
            result.__setDigit(i, digit);
        }
        if (borrow) {
            throw new Error('implementation bug');
        }
        for (let i = length; i < resultLength; i++) {
            result.__setDigit(i, 0);
        }
        return result;
    }
    static __absoluteAnd(x, y, result) {
        let xLength = x.length;
        let yLength = y.length;
        let numPairs = yLength;
        if (xLength < yLength) {
            numPairs = xLength;
            const tmp = x;
            const tmpLength = xLength;
            x = y;
            xLength = yLength;
            y = tmp;
            yLength = tmpLength;
        }
        let resultLength = numPairs;
        if (result === undefined) {
            result = new JSBI(resultLength, false);
        }
        else {
            resultLength = result.length;
        }
        let i = 0;
        for (; i < numPairs; i++) {
            result.__setDigit(i, x.__digit(i) & y.__digit(i));
        }
        for (; i < resultLength; i++) {
            result.__setDigit(i, 0);
        }
        return result;
    }
    static __absoluteAndNot(x, y, result) {
        const xLength = x.length;
        const yLength = y.length;
        let numPairs = yLength;
        if (xLength < yLength) {
            numPairs = xLength;
        }
        let resultLength = xLength;
        if (result === undefined) {
            result = new JSBI(resultLength, false);
        }
        else {
            resultLength = result.length;
        }
        let i = 0;
        for (; i < numPairs; i++) {
            result.__setDigit(i, x.__digit(i) & ~y.__digit(i));
        }
        for (; i < xLength; i++) {
            result.__setDigit(i, x.__digit(i));
        }
        for (; i < resultLength; i++) {
            result.__setDigit(i, 0);
        }
        return result;
    }
    static __absoluteOr(x, y, result) {
        let xLength = x.length;
        let yLength = y.length;
        let numPairs = yLength;
        if (xLength < yLength) {
            numPairs = xLength;
            const tmp = x;
            const tmpLength = xLength;
            x = y;
            xLength = yLength;
            y = tmp;
            yLength = tmpLength;
        }
        let resultLength = xLength;
        if (result === undefined) {
            result = new JSBI(resultLength, false);
        }
        else {
            resultLength = result.length;
        }
        let i = 0;
        for (; i < numPairs; i++) {
            result.__setDigit(i, x.__digit(i) | y.__digit(i));
        }
        for (; i < xLength; i++) {
            result.__setDigit(i, x.__digit(i));
        }
        for (; i < resultLength; i++) {
            result.__setDigit(i, 0);
        }
        return result;
    }
    static __absoluteXor(x, y, result) {
        let xLength = x.length;
        let yLength = y.length;
        let numPairs = yLength;
        if (xLength < yLength) {
            numPairs = xLength;
            const tmp = x;
            const tmpLength = xLength;
            x = y;
            xLength = yLength;
            y = tmp;
            yLength = tmpLength;
        }
        let resultLength = xLength;
        if (result === undefined) {
            result = new JSBI(resultLength, false);
        }
        else {
            resultLength = result.length;
        }
        let i = 0;
        for (; i < numPairs; i++) {
            result.__setDigit(i, x.__digit(i) ^ y.__digit(i));
        }
        for (; i < xLength; i++) {
            result.__setDigit(i, x.__digit(i));
        }
        for (; i < resultLength; i++) {
            result.__setDigit(i, 0);
        }
        return result;
    }
    static __absoluteCompare(x, y) {
        const diff = x.length - y.length;
        if (diff !== 0)
            return diff;
        let i = x.length - 1;
        while (i >= 0 && x.__digit(i) === y.__digit(i))
            i--;
        if (i < 0)
            return 0;
        return x.__unsignedDigit(i) > y.__unsignedDigit(i) ? 1 : -1;
    }
    static __multiplyAccumulate(multiplicand, multiplier, accumulator, accumulatorIndex) {
        if (multiplier === 0)
            return;
        const m2Low = multiplier & 0xffff;
        const m2High = multiplier >>> 16;
        let carry = 0;
        let highLower = 0;
        let highHigher = 0;
        for (let i = 0; i < multiplicand.length; i++, accumulatorIndex++) {
            let acc = accumulator.__digit(accumulatorIndex);
            let accLow = acc & 0xffff;
            let accHigh = acc >>> 16;
            const m1 = multiplicand.__digit(i);
            const m1Low = m1 & 0xffff;
            const m1High = m1 >>> 16;
            const rLow = Math.imul(m1Low, m2Low);
            const rMid1 = Math.imul(m1Low, m2High);
            const rMid2 = Math.imul(m1High, m2Low);
            const rHigh = Math.imul(m1High, m2High);
            accLow += highLower + (rLow & 0xffff);
            accHigh +=
                highHigher + carry + (accLow >>> 16) + (rLow >>> 16) + (rMid1 & 0xffff) + (rMid2 & 0xffff);
            carry = accHigh >>> 16;
            highLower = (rMid1 >>> 16) + (rMid2 >>> 16) + (rHigh & 0xffff) + carry;
            carry = highLower >>> 16;
            highLower &= 0xffff;
            highHigher = rHigh >>> 16;
            acc = (accLow & 0xffff) | (accHigh << 16);
            accumulator.__setDigit(accumulatorIndex, acc);
        }
        for (; carry !== 0 || highLower !== 0 || highHigher !== 0; accumulatorIndex++) {
            let acc = accumulator.__digit(accumulatorIndex);
            const accLow = (acc & 0xffff) + highLower;
            const accHigh = (acc >>> 16) + (accLow >>> 16) + highHigher + carry;
            highLower = 0;
            highHigher = 0;
            carry = accHigh >>> 16;
            acc = (accLow & 0xffff) | (accHigh << 16);
            accumulator.__setDigit(accumulatorIndex, acc);
        }
    }
    static __internalMultiplyAdd(source, factor, summand, n, result) {
        let carry = summand;
        let high = 0;
        for (let i = 0; i < n; i++) {
            const digit = source.__digit(i);
            const rx = Math.imul(digit & 0xffff, factor);
            const r0 = (rx & 0xffff) + high + carry;
            carry = r0 >>> 16;
            const ry = Math.imul(digit >>> 16, factor);
            const r16 = (ry & 0xffff) + (rx >>> 16) + carry;
            carry = r16 >>> 16;
            high = ry >>> 16;
            result.__setDigit(i, (r16 << 16) | (r0 & 0xffff));
        }
        if (result.length > n) {
            result.__setDigit(n++, carry + high);
            while (n < result.length) {
                result.__setDigit(n++, 0);
            }
        }
        else {
            if (carry + high !== 0)
                throw new Error('implementation bug');
        }
    }
    __inplaceMultiplyAdd(multiplier, summand, length) {
        if (length > this.length)
            length = this.length;
        const mLow = multiplier & 0xffff;
        const mHigh = multiplier >>> 16;
        let carry = 0;
        let highLower = summand & 0xffff;
        let highHigher = summand >>> 16;
        for (let i = 0; i < length; i++) {
            const d = this.__digit(i);
            const dLow = d & 0xffff;
            const dHigh = d >>> 16;
            const pLow = Math.imul(dLow, mLow);
            const pMid1 = Math.imul(dLow, mHigh);
            const pMid2 = Math.imul(dHigh, mLow);
            const pHigh = Math.imul(dHigh, mHigh);
            const rLow = highLower + (pLow & 0xffff);
            const rHigh = highHigher + carry + (rLow >>> 16) + (pLow >>> 16) + (pMid1 & 0xffff) + (pMid2 & 0xffff);
            highLower = (pMid1 >>> 16) + (pMid2 >>> 16) + (pHigh & 0xffff) + (rHigh >>> 16);
            carry = highLower >>> 16;
            highLower &= 0xffff;
            highHigher = pHigh >>> 16;
            const result = (rLow & 0xffff) | (rHigh << 16);
            this.__setDigit(i, result);
        }
        if (carry !== 0 || highLower !== 0 || highHigher !== 0) {
            throw new Error('implementation bug');
        }
    }
    static __absoluteDivSmall(x, divisor, quotient) {
        if (quotient === undefined)
            quotient = new JSBI(x.length, false);
        let remainder = 0;
        for (let i = x.length * 2 - 1; i >= 0; i -= 2) {
            let input = ((remainder << 16) | x.__halfDigit(i)) >>> 0;
            const upperHalf = (input / divisor) | 0;
            remainder = input % divisor | 0;
            input = ((remainder << 16) | x.__halfDigit(i - 1)) >>> 0;
            const lowerHalf = (input / divisor) | 0;
            remainder = input % divisor | 0;
            quotient.__setDigit(i >>> 1, (upperHalf << 16) | lowerHalf);
        }
        return quotient;
    }
    static __absoluteModSmall(x, divisor) {
        let remainder = 0;
        for (let i = x.length * 2 - 1; i >= 0; i--) {
            const input = ((remainder << 16) | x.__halfDigit(i)) >>> 0;
            remainder = input % divisor | 0;
        }
        return remainder;
    }
    static __absoluteDivLarge(dividend, divisor, wantQuotient, wantRemainder) {
        const n = divisor.__halfDigitLength();
        const n2 = divisor.length;
        const m = dividend.__halfDigitLength() - n;
        let q;
        if (wantQuotient) {
            q = new JSBI((m + 2) >>> 1, false);
            q.__initializeDigits();
        }
        const qhatv = new JSBI((n + 2) >>> 1, false);
        qhatv.__initializeDigits();
        const shift = JSBI.__clz16(divisor.__halfDigit(n - 1));
        if (shift > 0) {
            divisor = JSBI.__specialLeftShift(divisor, shift, 0);
        }
        const u = JSBI.__specialLeftShift(dividend, shift, 1);
        const vn1 = divisor.__halfDigit(n - 1);
        let halfDigitBuffer = 0;
        for (let j = m; j >= 0; j--) {
            let qhat = 0xffff;
            const ujn = u.__halfDigit(j + n);
            if (ujn !== vn1) {
                const input = ((ujn << 16) | u.__halfDigit(j + n - 1)) >>> 0;
                qhat = (input / vn1) | 0;
                let rhat = input % vn1 | 0;
                const vn2 = divisor.__halfDigit(n - 2);
                const ujn2 = u.__halfDigit(j + n - 2);
                while (Math.imul(qhat, vn2) >>> 0 > ((rhat << 16) | ujn2) >>> 0) {
                    qhat--;
                    rhat += vn1;
                    if (rhat > 0xffff)
                        break;
                }
            }
            JSBI.__internalMultiplyAdd(divisor, qhat, 0, n2, qhatv);
            let c = u.__inplaceSub(qhatv, j, n + 1);
            if (c !== 0) {
                c = u.__inplaceAdd(divisor, j, n);
                u.__setHalfDigit(j + n, u.__halfDigit(j + n) + c);
                qhat--;
            }
            if (q !== undefined) {
                if (j & 1) {
                    halfDigitBuffer = qhat << 16;
                }
                else {
                    q.__setDigit(j >>> 1, halfDigitBuffer | qhat);
                }
            }
        }
        if (wantRemainder) {
            u.__inplaceRightShift(shift);
            if (q) {
                return { quotient: q, remainder: u };
            }
            return u;
        }
        if (q)
            return q;
    }
    static __clz16(value) {
        return Math.clz32(value) - 16;
    }
    __inplaceAdd(summand, startIndex, halfDigits) {
        let carry = 0;
        for (let i = 0; i < halfDigits; i++) {
            const sum = this.__halfDigit(startIndex + i) + summand.__halfDigit(i) + carry;
            carry = sum >>> 16;
            this.__setHalfDigit(startIndex + i, sum);
        }
        return carry;
    }
    __inplaceSub(subtrahend, startIndex, halfDigits) {
        const fullSteps = (halfDigits - 1) >>> 1;
        let borrow = 0;
        if (startIndex & 1) {
            startIndex >>= 1;
            let current = this.__digit(startIndex);
            let r0 = current & 0xffff;
            let i = 0;
            for (; i < fullSteps; i++) {
                const sub = subtrahend.__digit(i);
                const r16 = (current >>> 16) - (sub & 0xffff) - borrow;
                borrow = (r16 >>> 16) & 1;
                this.__setDigit(startIndex + i, (r16 << 16) | (r0 & 0xffff));
                current = this.__digit(startIndex + i + 1);
                r0 = (current & 0xffff) - (sub >>> 16) - borrow;
                borrow = (r0 >>> 16) & 1;
            }
            const sub = subtrahend.__digit(i);
            const r16 = (current >>> 16) - (sub & 0xffff) - borrow;
            borrow = (r16 >>> 16) & 1;
            this.__setDigit(startIndex + i, (r16 << 16) | (r0 & 0xffff));
            const subTop = sub >>> 16;
            if (startIndex + i + 1 >= this.length) {
                throw new RangeError('out of bounds');
            }
            if ((halfDigits & 1) === 0) {
                current = this.__digit(startIndex + i + 1);
                r0 = (current & 0xffff) - subTop - borrow;
                borrow = (r0 >>> 16) & 1;
                this.__setDigit(startIndex + subtrahend.length, (current & 0xffff0000) | (r0 & 0xffff));
            }
        }
        else {
            startIndex >>= 1;
            let i = 0;
            for (; i < subtrahend.length - 1; i++) {
                const current = this.__digit(startIndex + i);
                const sub = subtrahend.__digit(i);
                const r0 = (current & 0xffff) - (sub & 0xffff) - borrow;
                borrow = (r0 >>> 16) & 1;
                const r16 = (current >>> 16) - (sub >>> 16) - borrow;
                borrow = (r16 >>> 16) & 1;
                this.__setDigit(startIndex + i, (r16 << 16) | (r0 & 0xffff));
            }
            const current = this.__digit(startIndex + i);
            const sub = subtrahend.__digit(i);
            const r0 = (current & 0xffff) - (sub & 0xffff) - borrow;
            borrow = (r0 >>> 16) & 1;
            let r16 = 0;
            if ((halfDigits & 1) === 0) {
                r16 = (current >>> 16) - (sub >>> 16) - borrow;
                borrow = (r16 >>> 16) & 1;
            }
            this.__setDigit(startIndex + i, (r16 << 16) | (r0 & 0xffff));
        }
        return borrow;
    }
    __inplaceRightShift(shift) {
        if (shift === 0)
            return;
        let carry = this.__digit(0) >>> shift;
        const last = this.length - 1;
        for (let i = 0; i < last; i++) {
            const d = this.__digit(i + 1);
            this.__setDigit(i, (d << (32 - shift)) | carry);
            carry = d >>> shift;
        }
        this.__setDigit(last, carry);
    }
    static __specialLeftShift(x, shift, addDigit) {
        const n = x.length;
        const resultLength = n + addDigit;
        const result = new JSBI(resultLength, false);
        if (shift === 0) {
            for (let i = 0; i < n; i++)
                result.__setDigit(i, x.__digit(i));
            if (addDigit > 0)
                result.__setDigit(n, 0);
            return result;
        }
        let carry = 0;
        for (let i = 0; i < n; i++) {
            const d = x.__digit(i);
            result.__setDigit(i, (d << shift) | carry);
            carry = d >>> (32 - shift);
        }
        if (addDigit > 0) {
            result.__setDigit(n, carry);
        }
        return result;
    }
    static __leftShiftByAbsolute(x, y) {
        const shift = JSBI.__toShiftAmount(y);
        if (shift < 0)
            throw new RangeError('BigInt too big');
        const digitShift = shift >>> 5;
        const bitsShift = shift & 31;
        const length = x.length;
        const grow = bitsShift !== 0 && x.__digit(length - 1) >>> (32 - bitsShift) !== 0;
        const resultLength = length + digitShift + (grow ? 1 : 0);
        const result = new JSBI(resultLength, x.sign);
        if (bitsShift === 0) {
            let i = 0;
            for (; i < digitShift; i++)
                result.__setDigit(i, 0);
            for (; i < resultLength; i++) {
                result.__setDigit(i, x.__digit(i - digitShift));
            }
        }
        else {
            let carry = 0;
            for (let i = 0; i < digitShift; i++)
                result.__setDigit(i, 0);
            for (let i = 0; i < length; i++) {
                const d = x.__digit(i);
                result.__setDigit(i + digitShift, (d << bitsShift) | carry);
                carry = d >>> (32 - bitsShift);
            }
            if (grow) {
                result.__setDigit(length + digitShift, carry);
            }
            else {
                if (carry !== 0)
                    throw new Error('implementation bug');
            }
        }
        return result.__trim();
    }
    static __rightShiftByAbsolute(x, y) {
        const length = x.length;
        const sign = x.sign;
        const shift = JSBI.__toShiftAmount(y);
        if (shift < 0)
            return JSBI.__rightShiftByMaximum(sign);
        const digitShift = shift >>> 5;
        const bitsShift = shift & 31;
        let resultLength = length - digitShift;
        if (resultLength <= 0)
            return JSBI.__rightShiftByMaximum(sign);
        let mustRoundDown = false;
        if (sign) {
            const mask = (1 << bitsShift) - 1;
            if ((x.__digit(digitShift) & mask) !== 0) {
                mustRoundDown = true;
            }
            else {
                for (let i = 0; i < digitShift; i++) {
                    if (x.__digit(i) !== 0) {
                        mustRoundDown = true;
                        break;
                    }
                }
            }
        }
        if (mustRoundDown && bitsShift === 0) {
            const msd = x.__digit(length - 1);
            const roundingCanOverflow = ~msd === 0;
            if (roundingCanOverflow)
                resultLength++;
        }
        let result = new JSBI(resultLength, sign);
        if (bitsShift === 0) {
            for (let i = digitShift; i < length; i++) {
                result.__setDigit(i - digitShift, x.__digit(i));
            }
        }
        else {
            let carry = x.__digit(digitShift) >>> bitsShift;
            const last = length - digitShift - 1;
            for (let i = 0; i < last; i++) {
                const d = x.__digit(i + digitShift + 1);
                result.__setDigit(i, (d << (32 - bitsShift)) | carry);
                carry = d >>> bitsShift;
            }
            result.__setDigit(last, carry);
        }
        if (mustRoundDown) {
            result = JSBI.__absoluteAddOne(result, true, result);
        }
        return result.__trim();
    }
    static __rightShiftByMaximum(sign) {
        if (sign) {
            return JSBI.__oneDigit(1, true);
        }
        return JSBI.__zero();
    }
    static __toShiftAmount(x) {
        if (x.length > 1)
            return -1;
        const value = x.__unsignedDigit(0);
        if (value > JSBI__kMaxLengthBits)
            return -1;
        return value;
    }
    static __toPrimitive(obj, hint = 'default') {
        if (typeof obj !== 'object')
            return obj;
        if (obj instanceof JSBI)
            return obj;
        if (obj === null) {
            throw new TypeError('Cannot convert null to primitive value');
        }
        const exoticToPrim = obj[Symbol.toPrimitive];
        if (exoticToPrim) {
            const primitive = exoticToPrim(hint);
            if (typeof primitive !== 'object')
                return primitive;
            throw new TypeError('Cannot convert object to primitive value');
        }
        const valueOf = obj.valueOf;
        if (valueOf) {
            const primitive = valueOf.call(obj);
            if (typeof primitive !== 'object')
                return primitive;
        }
        const toString = obj.toString;
        if (toString) {
            const primitive = toString.call(obj);
            if (typeof primitive !== 'object')
                return primitive;
        }
        throw new TypeError('Cannot convert object to primitive value');
    }
    static __toNumeric(value) {
        if (JSBI.__isBigInt(value))
            return value;
        return +value;
    }
    static __isBigInt(value) {
        return value instanceof JSBI;
    }
    static __truncateToNBits(n, x) {
        const neededDigits = (n + 31) >>> 5;
        const result = new JSBI(neededDigits, x.sign);
        const last = neededDigits - 1;
        for (let i = 0; i < last; i++) {
            result.__setDigit(i, x.__digit(i));
        }
        let msd = x.__digit(last);
        if ((n & 31) !== 0) {
            const drop = 32 - (n & 31);
            msd = (msd << drop) >>> drop;
        }
        result.__setDigit(last, msd);
        return result.__trim();
    }
    static __truncateAndSubFromPowerOfTwo(n, x, resultSign) {
        const neededDigits = (n + 31) >>> 5;
        const result = new JSBI(neededDigits, resultSign);
        let i = 0;
        const last = neededDigits - 1;
        let borrow = 0;
        const limit = Math.min(last, x.length);
        for (; i < limit; i++) {
            const xDigit = x.__digit(i);
            const rLow = 0 - (xDigit & 0xffff) - borrow;
            borrow = (rLow >>> 16) & 1;
            const rHigh = 0 - (xDigit >>> 16) - borrow;
            borrow = (rHigh >>> 16) & 1;
            result.__setDigit(i, (rLow & 0xffff) | (rHigh << 16));
        }
        for (; i < last; i++) {
            result.__setDigit(i, -borrow | 0);
        }
        let msd = last < x.length ? x.__digit(last) : 0;
        const msdBitsConsumed = n & 31;
        let resultMsd;
        if (msdBitsConsumed === 0) {
            const rLow = 0 - (msd & 0xffff) - borrow;
            borrow = (rLow >>> 16) & 1;
            const rHigh = 0 - (msd >>> 16) - borrow;
            resultMsd = (rLow & 0xffff) | (rHigh << 16);
        }
        else {
            const drop = 32 - msdBitsConsumed;
            msd = (msd << drop) >>> drop;
            const minuendMsd = 1 << (32 - drop);
            const rLow = (minuendMsd & 0xffff) - (msd & 0xffff) - borrow;
            borrow = (rLow >>> 16) & 1;
            const rHigh = (minuendMsd >>> 16) - (msd >>> 16) - borrow;
            resultMsd = (rLow & 0xffff) | (rHigh << 16);
            resultMsd &= minuendMsd - 1;
        }
        result.__setDigit(last, resultMsd);
        return result.__trim();
    }
    __digit(i) {
        return this[i];
    }
    __unsignedDigit(i) {
        return this[i] >>> 0;
    }
    __setDigit(i, digit) {
        this[i] = digit | 0;
    }
    __setDigitGrow(i, digit) {
        this[i] = digit | 0;
    }
    __halfDigitLength() {
        const len = this.length;
        if (this.__unsignedDigit(len - 1) <= 0xffff)
            return len * 2 - 1;
        return len * 2;
    }
    __halfDigit(i) {
        return (this[i >>> 1] >>> ((i & 1) << 4)) & 0xffff;
    }
    __setHalfDigit(i, value) {
        const digitIndex = i >>> 1;
        const previous = this.__digit(digitIndex);
        const updated = i & 1 ? (previous & 0xffff) | (value << 16) : (previous & 0xffff0000) | (value & 0xffff);
        this.__setDigit(digitIndex, updated);
    }
    static __digitPow(base, exponent) {
        let result = 1;
        while (exponent > 0) {
            if (exponent & 1)
                result *= base;
            exponent >>>= 1;
            base *= base;
        }
        return result;
    }
}
export { JSBI };
