// # calculator-backends.js
//
// more things to do with a simple calculator parser
//
// [calculator-parser.js](calculator-parser.html) contains a simple parser.
// It contains enough code that you can actually do some basic math with it.
// But what else can you do with a parser?
//
// This file contains seven different applications of
// the calculator parser.
//
// [Try them out.](../calculator.html)

// ## Interpreters

// ### 1. Evaluate using floating-point numbers

// This behaves like a stripped-down version of JavaScript `eval()`.
function evaluateAsFloat(code) {
    var calculator = {
        number: function (s) { return parseInt(s); },
        add: function (a, b) { return a + b; },
        sub: function (a, b) { return a - b; },
        mul: function (a, b) { return a * b; },
        div: function (a, b) { return a / b; },
        _variables: Object.create(null),
        name: function (name) { return this._variables[name] || 0; }
    };

    calculator._variables.e = Math.E;
    calculator._variables.pi = Math.PI;

    return parse(code, calculator);
}


// ### 2. Evaluate using precise fraction arithmetic
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
    var x = gcd(n, d);
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
    var fractionCalculator = {
        number: function (s) { return new Fraction(new BigInteger(s)); },
        add: function (a, b) { return a.add(b); },
        sub: function (a, b) { return a.sub(b); },
        mul: function (a, b) { return a.mul(b); },
        div: function (a, b) { return a.div(b); },
        name: function (name) { throw new SyntaxError("no variables in fraction mode, sorry"); }
    };
    return parse(code, fractionCalculator);
}

// Our tiny programming language is suddenly doing something JavaScript itself
// doesn’t do: arithmetic with exact (not floating-point) results.  Tests:
assert.strictEqual(evaluateAsFraction("1 / 3").toString(), "1/3");
assert.strictEqual(evaluateAsFraction("(2/3) * (3/2)").toString(), "1");
assert.strictEqual(evaluateAsFraction("1/7 + 4/7 + 2/7").toString(), "1");
assert.strictEqual(
    evaluateAsFraction("5996788328646786302319492/2288327879043508396784319").toString(),
    "324298349324/123749732893");


// ## Code as data

// ### 3. Convert to DOM
//
// Both examples above compute a result.  But that isn’t the only thing you can
// do with language. Let’s make a program that doesn’t compute anything at all:
// it simply spits out DOM nodes that show how the program would look in
// Scratch. (!)

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

// Yet another pluggable `out` object.
function convertToDOM(code) {
    var spanBuilder = {
        number: function (s) { return span("num", [s]); },
        add: function (a, b) { return span("expr", [a, "+", b]); },
        sub: function (a, b) { return span("expr", [a, "\u2212", b]); },  // &minus;
        mul: function (a, b) { return span("expr", [a, "\u00d7", b]); },  // &times;
        div: function (a, b) { return span("expr", [a, "\u00f7", b]); },  // &divide;
        name: function (name) { return span("var", [name]); }
    };
    return parse(code, spanBuilder);
}


// ### 4. Convert to JSON
//
// Let’s make one that builds a tree describing the input formula. This is
// called an abstract syntax tree, or AST. **This is most likely what you would
// do if you planned to make your own programming language.** It was once
// common to parse and emit code in a single pass. Languages were carefully
// designed to make sure that was possible. Today, there’s really no reason not
// to build a complete AST or other intermediate form, then emit code in a
// second pass.

// Each method simply returns a new JS object.
function convertToAST(code) {
    var astBuilder = {
        number: function (s) { return {type: "number", value: s}; },
        add: function (a, b) { return {type: "add", left: a, right: b}; },
        sub: function (a, b) { return {type: "sub", left: a, right: b}; },
        mul: function (a, b) { return {type: "mul", left: a, right: b}; },
        div: function (a, b) { return {type: "div", left: a, right: b}; },
        name: function (name) { return {type: "name", name: name}; }
    };
    return parse(code, astBuilder);
}

// And test it.
assert.deepEqual(
    convertToAST("(1 + 2) / 3"),
    {
        type: "div",
        left: {
            type: "add",
            left: {type: "number", value: "1"},
            right: {type: "number", value: "2"}
        },
        right: {type: "number", value: "3"}
    });


// ### 5. MathML output
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
    var mathmlBuilder = {
        number: function (s) { return make("mn", 3, [s]); },
        add: function (a, b) { return make("mrow", 1, [a, make("mo", 3, ["+"]), b]); },
        sub: function (a, b) { return make("mrow", 1, [a, make("mo", 3, ["-"]), b]); },
        mul: function (a, b) { return make("mrow", 2, [a, b]); },
        div: function (a, b) { return make("mfrac", null, [a, b]); },
        name: function (name) { return make("mi", 3, [name]); }
    };
    var e = parse(code, mathmlBuilder);
    return make("math", null, [e]);
}


// ## Compilers

// ### 6. JavaScript function output

// This is just to show some very basic code generation.
//
// Code generation for a real compiler will be harder, because the target
// language is typically quite a bit different from the source language. Here
// they are virtually identical, so code generation is very easy.
//
function compileToJSFunction(code) {
    var jsFunctionBuilder = {
        number: function (s) { return s; },
        add: function (a, b) { return "(" + a + " + " + b + ")"; },
        sub: function (a, b) { return "(" + a + " - " + b + ")"; },
        mul: function (a, b) { return "(" + a + " * " + b + ")"; },
        div: function (a, b) { return "(" + a + " / " + b + ")"; },
        name: function (name) {
            // Only allow the name "x".
            if (name !== "x")
                throw SyntaxError("only the name 'x' is allowed");
            return name;
        }
    };

    var code = parse(code, jsFunctionBuilder);
    return Function("x", "return " + code + ";");
}

assert.strictEqual(compileToJSFunction("x*x - 2*x + 1")(1), 0);
assert.strictEqual(compileToJSFunction("x*x - 2*x + 1")(2), 1);
assert.strictEqual(compileToJSFunction("x*x - 2*x + 1")(3), 4);
assert.strictEqual(compileToJSFunction("x*x - 2*x + 1")(4), 9);


// ### 7. Complex function output

// This one returns a JS function that operates on complex numbers.
//
// TODO - explain what is going on here.
//
function compileToComplexFunction(code) {
    var nextTmpId = 0;

    function genName() {
        return "tmp" + nextTmpId++;
    }

    var complexFunctionBuilder = {
        number: function (s) {
            return { setup: "", re: s, im: "0" };
        },
        add: function (a, b) {
            return {
                setup: a.setup + b.setup,
                re: a.re + " + " + b.re,
                im: a.im + " + " + b.im
            };
        },
        sub: function (a, b) {
            return {
                setup: a.setup + b.setup,
                re: a.re + " - " + b.re,
                im: a.im + " - " + b.im
            };
        },
        mul: function (a, b) {
            // This requires some setup.  First write some code to store the
            // real and imaginary parts of a and b in temporary variables.
            // We have to store them in temporary variables because the formula
            // for complex multiplication uses each component twice, and we
            // don’t want to compute them twice.
            var atmp = genName(),
                btmp = genName();
            var setup = a.setup + b.setup +
                ("var A_re = " + a.re + ", A_im = " + a.im + ";\n").replace(/A/g, atmp) +
                ("var B_re = " + b.re + ", B_im = " + b.im + ";\n").replace(/B/g, btmp);

            // Now return the setup, along with expressions for computing the
            // real and imaginary parts of (a * b).
            return {
                setup: setup,
                re: "A_re * B_re - A_im * B_im".replace(/A/g, atmp).replace(/B/g, btmp),
                im: "A_re * B_im + A_im * B_re".replace(/A/g, atmp).replace(/B/g, btmp)
            };
        },
        div: function (a, b) {
            // Just as for multiplication, first write some code to store the real
            // and imaginary parts of a and b in temporary variables.
            var atmp = genName(),
                btmp = genName(),
                tmp = genName();
            var setup = a.setup + b.setup +
                ("var A_re = " + a.re + ", A_im = " + a.im + ";\n").replace(/A/g, atmp) +
                ("var B_re = " + b.re + ", B_im = " + b.im + ";\n").replace(/B/g, btmp) +
                ("var T = B_re * B_re + B_im * B_im;\n").replace(/T/g, tmp).replace(/B/g, btmp);
            return {
                setup: setup,
                re: "(A_re * B_re + A_im * B_im) / T".replace(/A/g, atmp).replace(/B/g, btmp).replace(/T/g, tmp),
                im: "(A_im * B_re - A_re * B_im) / T".replace(/A/g, atmp).replace(/B/g, btmp).replace(/T/g, tmp)
            };
        },
        name: function (name) {
            if (name === "i")
                return {setup: "", re: "0", im: "1"};
            if (name !== "z")
                throw SyntaxError("undefined variable: " + name);
            return {
                setup: "",
                re: name + "_re",
                im: name + "_im"
            };
        }
    };

    var result = parse(code, complexFunctionBuilder);
    var tmp = genName();
    var code =
        result.setup +
        "return {re: " + result.re + ", im: " + result.im + "};\n";
    return Function("z_re, z_im", code);

    /*
      I had planned to have this generate asm.js code for extra speed, but it's
      so fast already that unless I can think of a more computationally
      intensive task, there is no need.
         result.setup +
         "var " + tmp + " = " + result.re + ";\n" +
         "z_im = " + result.im + ";\n" +
         "z_re = " + tmp + ";\n" +
    */

}

// The last bit of code here simply stores all seven back ends in one place
// where other code can get to them.
var parseModes = {
    calc: evaluateAsFloat,
    fraction: evaluateAsFraction,
    blocks: convertToDOM,
    json: convertToAST,
    mathml: convertToMathML,
    graph: compileToJSFunction,
    complex: compileToComplexFunction
};
