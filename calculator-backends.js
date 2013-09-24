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
// Here is a more advanced example of code generation.
//
function compileToComplexFunction(code) {
    var nextTmpId = 0;

    function genName() {
        return "tmp" + nextTmpId++;
    }

    function emit(obj) {
        switch (obj.type) {
        case "number":
            return { setup: "", re: obj.value, im: "0" };

        case "+": case "-":
            var a = emit(obj.left), b = emit(obj.right);
            return {
                setup: a.setup + b.setup,
                re: a.re + " " + obj.type + " (" + b.re + ")",
                im: a.im + " " + obj.type + " (" + b.im + ")"
            };

        case "*":
            var a = emit(obj.left), b = emit(obj.right);

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

        case "/":
            var a = emit(obj.left), b = emit(obj.right);

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

        case "name":
            if (obj.id === "i")
                return {setup: "", re: "0", im: "1"};
            if (obj.id !== "z")
                throw SyntaxError("undefined variable: " + obj.id);
            return {
                setup: "",
                re: obj.id + "_re",
                im: obj.id + "_im"
            };
        }
    }

    var result = emit(parse(code));
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
    json: convertToJSON,
    blocks: convertToDOM,
    mathml: convertToMathML,
    calc: evaluateAsFloat,
    fraction: evaluateAsFraction,
    graph: compileToJSFunction,
    complex: compileToComplexFunction
};
