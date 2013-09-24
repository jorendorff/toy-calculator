// # calculator-backends.js
//
// things to do with a simple calculator parser
//
// [calculator-parser.js](calculator-parser.html) contains a simple parser.
// It contains enough code that you can actually do some basic math with it.
// But what else can you do with a parser?
//
// This file contains seven different applications of
// the calculator parser.
//
// [Try them out.](../calculator.html)

// ## Code as data

// ### 1. Show the JSON
//
// Unmodified, the parser simply builds a tree describing the input
// formula. This is called an abstract syntax tree, or AST.
//
function convertToJSON(code) {
    return parse(code);
}


// ### 2. Convert to DOM
//
// Of course one of the nice things about JSON is that there are many ways to
// display it. Here’s code that spits out DOM nodes that show how the program
// would look in Scratch. (!)

// Helper function to create DOM elements.
function span(className, contents) {
    var e = document.createElement("span");
    e.className = className;
    for (var i = 0; i < contents.length; i++) {
        var kid = contents[i];
        if (typeof kid === "string")
            kid = document.createTextNode(kid);
        e.appendChild(kid);
    }
    return e;
}

function convertToDOM(code) {
    var fancyOperator = {
        "+": "+",
        "-": "\u2212",  // &minus;
        "*": "\u00d7",  // &times;
        "/": "\u00f7"   // &divide;
    };

    function convert(obj) {
        switch (obj.type) {
        case "number":
            return span("num", [obj.value]);
        case "+": case "-": case "*": case "/":
            return span("expr", [convert(obj.left),
                                 fancyOperator[obj.type],
                                 convert(obj.right)]);
        case "name":
            return span("var", [obj.id]);
        }
    }
    return convert(parse(code));
}


// ### 3. MathML output
//
// One more riff on this theme: How about generating beautiful MathML output?
// (Unfortunately, some browsers still do not support MathML. Firefox does.)

// The hardest part of this was figuring out how to make MathML elements.
// Here’s some code to help with that.
var mathml = "http://www.w3.org/1998/Math/MathML";

function mo(s) {
    var e = document.createElementNS(mathml, "mo");
    var t = document.createTextNode(s);
    e.appendChild(t);
    return {prec: 3, element: e};
}

// Create a new MathML DOM element of the specified type and contents.
// `precedence` is used to determine whether or not to add parentheses around
// any of the contents. If it’s `null`, no parentheses are added.
function make(name, precedence, contents) {
    var e = document.createElementNS(mathml, name);
    for (var i = 0; i < contents.length; i++) {
        var kid = contents[i];
        var node;

        if (typeof kid === "string") {
            node = document.createTextNode(kid);
        } else {
            // If precedence is non-null and higher than this child’s
            // precedence, wrap the child in parentheses.
            if (precedence !== null
                && (kid.prec < precedence
                    || (kid.prec == precedence && i != 0)))
            {
                kid = make("mrow", null, [mo("("), kid, mo(")")]);
            }
            node = kid.element;
        }
        e.appendChild(node);
    }
    if (precedence === null)
        precedence = 3;
    return {prec: precedence, element: e};
}

function convertToMathML(code) {
    function convert(obj) {
        switch (obj.type) {
        case "number":
            return make("mn", 3, [obj.value]);
        case "name":
            return make("mi", 3, [obj.id]);
        case "+":
            return make("mrow", 1, [convert(obj.left),
                                    make("mo", 3, ["+"]),
                                    convert(obj.right)]);
        case "-":
            return make("mrow", 1, [convert(obj.left),
                                    make("mo", 3, ["-"]),
                                    convert(obj.right)]);
        case "*":
            return make("mrow", 2, [convert(obj.left),
                                    convert(obj.right)]);
        case "/":
            return make("mfrac", null, [convert(obj.left), convert(obj.right)]);
        }
    };
    var e = convert(parse(code));
    return make("math", null, [e]);
}


// ## Interpreters

// ### 4. Evaluate using floating-point numbers

// Now let’s try actually performing some computation using the program we
// read. This behaves like a stripped-down version of JavaScript `eval()`.
function evaluateAsFloat(code) {
    var variables = Object.create(null);
    variables.e = Math.E;
    variables.pi = Math.PI;

    function evaluate(obj) {
        switch (obj.type) {
        case "number":  return parseInt(obj.value);
        case "name":  return variables[obj.id] || 0;
        case "+":  return evaluate(obj.left) + evaluate(obj.right);
        case "-":  return evaluate(obj.left) - evaluate(obj.right);
        case "*":  return evaluate(obj.left) * evaluate(obj.right);
        case "/":  return evaluate(obj.left) / evaluate(obj.right);
        }
    }
    return evaluate(parse(code));
}

assert.strictEqual(evaluateAsFloat("2 + 2"), 4);
assert.strictEqual(evaluateAsFloat("3 * 4 * 5"), 60);
assert.strictEqual(evaluateAsFloat("5 * (2 + 2)"), 20);


// ### 5. Evaluate using precise fraction arithmetic
//
// Our little language is a tiny subset of JavaScript. But that doesn’t meant
// it has to behave exactly like JavaScript. This is our language.
// It can behave however we want.

// So how about a calculator that does arbitrary precision arithmetic?
// Let’s start by defining a `Fraction` class...

var BigInteger = require('biginteger').BigInteger;

function gcd(a, b) {
    while (!b.isZero()) {
        var tmp = a;
        a = b;
        b = tmp.remainder(b);
    }
    return a;
}

function Fraction(n, d) {
    if (d === undefined)
        d = new BigInteger(1);
    var x = gcd(n.abs(), d);  // Simplify the fraction.
    this.n = n.divide(x);
    this.d = d.divide(x);
}

// …and some Fraction methods. You learned these techniques in grade school,
// though you may have forgotten some of them.
Fraction.prototype = {
    add: function (x) {
        return new Fraction(this.n.multiply(x.d).add(x.n.multiply(this.d)),
                            this.d.multiply(x.d));
    },
    negate: function (x) {
        return new Fraction(this.n.negate(), this.d);
    },
    sub: function (x) {
        return this.add(x.negate());
    },
    mul: function (x) {
        return new Fraction(this.n.multiply(x.n), this.d.multiply(x.d));
    },
    div: function (x) {
        return new Fraction(this.n.multiply(x.d), this.d.multiply(x.n));
    },
    toString: function () {
        var ns = this.n.toString(), ds = this.d.toString();
        if (ds === "1")
            return ns;
        else
            return ns + "/" + ds;
    }
};

// Now simply write an `out` object that computes the results using `Fraction`
// objects rather than JavaScript numbers. It’s almost too easy.
function evaluateAsFraction(code) {
    function evaluate(obj) {
        switch (obj.type) {
        case "number":  return new Fraction(new BigInteger(obj.value));
        case "+":  return evaluate(obj.left).add(evaluate(obj.right));
        case "-":  return evaluate(obj.left).sub(evaluate(obj.right));
        case "*":  return evaluate(obj.left).mul(evaluate(obj.right));
        case "/":  return evaluate(obj.left).div(evaluate(obj.right));
        case "name":  throw new SyntaxError("no variables in fraction mode, sorry");
        }
    }
    return evaluate(parse(code));
}

// Our tiny programming language is suddenly doing something JavaScript itself
// doesn’t do: arithmetic with exact (not floating-point) results.  Tests:
assert.strictEqual(evaluateAsFraction("1 / 3").toString(), "1/3");
assert.strictEqual(evaluateAsFraction("(2/3) * (3/2)").toString(), "1");
assert.strictEqual(evaluateAsFraction("1/7 + 4/7 + 2/7").toString(), "1");
assert.strictEqual(
    evaluateAsFraction("5996788328646786302319492 / 2288327879043508396784319").toString(),
    "324298349324/123749732893");


// ## Compilers

// ### 6. JavaScript function output

// This is just to show some very basic code generation.
//
// Code generation for a real compiler will be harder, because the target
// language is typically quite a bit different from the source language. Here
// they are virtually identical, so code generation is very easy.
//
function compileToJSFunction(code) {
    function emit(obj) {
        switch (obj.type) {
        case "number":
            return obj.value;
        case "name":
            // Only allow the name "x".
            if (obj.id !== "x")
                throw SyntaxError("only the name 'x' is allowed");
            return obj.id;
        case "+": case "-": case "*": case "/":
            return "(" + emit(obj.left) + " " + obj.type + " " + emit(obj.right) + ")";
        }
    }

    return Function("x", "return " + emit(parse(code)) + ";");
}

assert.strictEqual(compileToJSFunction("x*x - 2*x + 1")(1), 0);
assert.strictEqual(compileToJSFunction("x*x - 2*x + 1")(2), 1);
assert.strictEqual(compileToJSFunction("x*x - 2*x + 1")(3), 4);
assert.strictEqual(compileToJSFunction("x*x - 2*x + 1")(4), 9);


// ### 7. Complex function output

// This one returns a JS function that operates on complex numbers.
//
// This is a more advanced example of a compiler. It has a lowering phase
// and a few simple optimizations.
//
// The input string `code` is a formula, for example, `"(z+1)/(z-1)"`,
// that uses a complex variable `z`.
//
// This returns a JS function that takes two arguments, `z_re` and `z_im`,
// the real and imaginary parts of a complex number *z*,
// and returns an object `{re: some number, im: some number}`,
// representing the complex result of computing the input formula,
// (*z*+1)/(*z*-1). Here is the actual output in that case:
//
//     (function anonymous(z_re, z_im) {
//     var t0 = (z_re+1);
//     var t1 = (z_re-1);
//     var t2 = (z_im*z_im);
//     var t3 = ((t1*t1)+t2);
//     return {re: (((t0*t1)+t2)/t3), im: (((z_im*t1)-(t0*z_im))/t3)};
//     })
//
function compileToComplexFunction(code) {
    // The first thing here is a lot of code about "values". This takes some
    // explanation.
    //
    // `compileToComplexFunction` works in three steps.
    //
    // 1. It uses `parse` as its front end. We get an AST that represents
    //    operations on complex numbers.
    //
    // 2. Then, it **lowers** the AST to an *intermediate representation* (IR)
    //    that’s sort of halfway between the AST and JS code.
    //
    //    The IR here is an array of *values*, basic arithmetic operations on
    //    plain old JS floating-point numbers. If we end up needing JS to
    //    compute `(z_re + 1) * (z_re - 1), then each subexpression there ends
    //    up being a value, represented by an object in the IR.
    //
    //    Once we have the IR, we can throw away the AST. The IR represents the
    //    same formula, but in a different form. Lowering breaks down complex
    //    arithmetic into sequences of JS numeric operations.  JS won't know
    //    it's doing complex math.
    //
    // 3. Lastly, we convert the IR to JS code.
    //
    // **Why lowering?** We don't have to do it this way; we could define a
    // class `Complex`, with methods `.add()`, `.sub()`, etc., and generate JS
    // code that uses that.  Lowering leads to faster JS code: we'll generate
    // code here that does not allocate any objects for intermediate results.

    // #### About the IR
    //
    // Before we implement lower(), we need to define objects representing
    // values. (We could just use strings of JS code, but it turns
    // out to be really complicated, and it's hard to apply even basic
    // optimizations to strings.)
    //
    // We call these instructions "values".  Each value represents a single JS
    // expression that evaluates to a number.  A value is one of:
    //
    //   1. `z_re` or `z_im`, the real or imaginary part of the argument z; or
    //   2. a numeric constant; or
    //   3. an arithmetic operation, one of `+ - * /`, on two previously-
    //      calculated values.
    //
    // And each value is represented by a plain old JSON object, as follows:
    //
    //   1. `{type: "arg", arg0: "z_re"` or `"z_im"}`
    //   2. `{type: "number", arg0: (string picture of number)}`
    //   3. `{type: (one of "+" "-" "*" "/"), arg0: (int), arg1: (int)}`
    //
    // All values are stored sequentially in the array `values`.  The two ints
    // `v.arg0` and `v.arg1` in an arithmetic value are indexes into `values`.
    //
    // The main reason to store all values in a flat array, rather than a tree,
    // is for "common subexpression elimination" (see valueToIndex).
    //
    var values = [
        {type: "arg", arg0: "z_re", arg1: null},
        {type: "arg", arg0: "z_im", arg1: null}
    ];

    // `values(n1, n2)` returns true if the two arguments `n1` and `n2` are
    // equal values—that is, if it would be redundant to compute them both,
    // because they are certain to have the same result.
    //
    // (This could be more sophisticated; it does not detect, for example, that
    // a+1 is equal to 1+a.)
    //
    function valuesEqual(n1, n2) {
        return n1.type === n2.type && n1.arg0 === n2.arg0 && n1.arg1 === n2.arg1;
    }

    // Return the index of `v` within `values`, adding it to `values` if needed.
    function valueToIndex(v) {
        // Common subexpression elimination. If we have already computed this
        // exact value, instead of computing it again, just reuse the already-
        // computed value.
        for (var i = 0; i < values.length; i++) {
            if (valuesEqual(values[i], v))
                return i;
        }

        // We have not already computed this value, so add the value to
        // the list.
        values.push(v);
        return values.length - 1;
    }

    function num(s) {
        return valueToIndex({type: "number", arg0: s, arg1: null});
    }

    function op(op, a, b) {
        return valueToIndex({type: op, arg0: a, arg1: b });
    }

    function isNumber(i) {
        return values[i].type === "number";
    }

    function isZero(i) {
        return isNumber(i) && values[i].arg0 === "0";
    }

    function isOne(i) {
        return isNumber(i) && values[i].arg0 === "1";
    }

    function add(a, b) {
        if (isZero(a))  // simplify (0+b) to b
            return b;
        if (isZero(b))  // simplify (a+0) to a
            return a;
        if (isNumber(a) && isNumber(b))  // constant-fold (1+2) to 3
            return num(String(Number(values[a].arg0) + Number(values[b].arg0)));
        return op("+", a, b);
    }

    function sub(a, b) {
        if (isZero(b))  // simplify (a-0) to a
            return a;
        if (isNumber(a) && isNumber(b))  // constant-fold (3-2) to 1
            return num(String(Number(values[a].arg0) - Number(values[b].arg0)));
        return op("-", a, b);
    }

    function mul(a, b) {
        if (isZero(a))  // simplify 0*b to 0
            return a;
        if (isZero(b))  // simplify a*0 to 0
            return b;
        if (isOne(a))  // simplify 1*b to b
            return b;
        if (isOne(b))  // simplify a*1 to a
            return a;
        if (isNumber(a) && isNumber(b))  // constant-fold (2*2) to 4
            return num(String(Number(values[a].arg0) * Number(values[b].arg0)));
        return op("*", a, b);
    }

    function div(a, b) {
        if (isOne(b))  // simplify a/1 to a
            return a;
        if (isNumber(a) && isNumber(b) && !isZero(b))  // constant-fold 4/2 to 2
            return num(String(Number(values[a].arg0) / Number(values[b].arg0)));
        return op("/", a, b);
    }

    // Reduce obj, which represents an operation on complex numbers,
    // to a pair of expressions on floating-point numbers.
    function lower(obj) {
        switch (obj.type) {
        case "number":
            return {re: num(obj.value), im: num("0")};

        case "+": case "-":
            var a = lower(obj.left), b = lower(obj.right);
            var f = (obj.type === "+" ? add : sub);
            return {
                re: f(a.re, b.re),
                im: f(a.im, b.im)
            };

        case "*":
            var a = lower(obj.left), b = lower(obj.right);
            return {
                re: sub(mul(a.re, b.re), mul(a.im, b.im)),
                im: add(mul(a.re, b.im), mul(a.im, b.re))
            };

        case "/":
            var a = lower(obj.left), b = lower(obj.right);
            var t = add(mul(b.re, b.re), mul(b.im, b.im));
            return {
                re: div(add(mul(a.re, b.re), mul(a.im, b.im)), t),
                im: div(sub(mul(a.im, b.re), mul(a.re, b.im)), t)
            };

        case "name":
            if (obj.id === "i")
                return {re: num("0"), im: num("1")};
            if (obj.id !== "z")
                throw SyntaxError("undefined variable: " + obj.id);
            // A little subtle here: values[0] is z_re; values[1] is z_im.
            return {re: 0, im: 1};
        }
    }

    function computeUseCounts(values) {
        var binaryOps = {"+": 1, "-": 1, "*": 1, "/": 1};
        var useCounts = [];
        for (var i = 0; i < values.length; i++) {
            useCounts[i] = 0;
            var node = values[i];
            if (node.type in binaryOps) {
                useCounts[node.arg0]++;
                useCounts[node.arg1]++;
            }
        }
        return useCounts;
    }

    function ir_to_js(values, result) {
        var useCounts = computeUseCounts(values);
        var code = "";
        var next_temp_id = 0;
        var js = [];
        for (var i = 0; i < values.length; i++) {
            var node = values[i];
            if (node.type === "number" || node.type === "arg")
                js[i] = node.arg0;
            else
                js[i] = "(" + js[node.arg0] + node.type + js[node.arg1] + ")";

            if (useCounts[i] > 1) {
                var name = "t" + next_temp_id++;
                code += "var " + name + " = " + js[i] + ";\n";
                js[i] = name;
            }
        }
        code += "return {re: " + js[result.re] + ", im: " + js[result.im] + "};\n";
        return code;
    }

    var ast = parse(code);
    var result = lower(ast);
    var code = ir_to_js(values, result);
    console.log(code);
    return Function("z_re, z_im", code);

    /*
      I had planned to have this generate asm.js code for extra speed, but it's
      so fast already that unless I can think of a more computationally
      intensive task, there is no need.
    */
}

// The last bit of code here simply stores all seven back ends in one place
// where other code can get to them.
var parseModes = {
    json: convertToJSON,
    blocks: convertToDOM,
    mathml: convertToMathML,
    calc: evaluateAsFloat,
    fraction: evaluateAsFraction,
    graph: compileToJSFunction,
    complex: compileToComplexFunction
};
