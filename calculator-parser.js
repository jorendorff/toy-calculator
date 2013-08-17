// # calculator-parser.js
//
// a simple calculator language, in three acts

// This program parses a very simple language that just does a little basic
// arithmetic. Here are some simple examples of the sort of thing you can
// write in the calculator language:
//
//   * `2 + 2`
//   * `1 * 2 + 3 * 4 + 5 / 6`
//   * `3 + 1/(7 + 1/(15 + 1/(1 + 1/(292 + 1/(1 + 1/(1 + 1/1))))))`
//   * `1 / ((z + 1) * (z - 1))`
//
// If you’d like to try it out, open [calculator.html](../calculator.html).


// ## Act One – Breaking code down into tokens

// This function, `tokenize(code)`, takes a string `code` and splits it into
// *tokens*, the numbers, words, and symbols that make up our little calculator
// mini-language.
function tokenize(code) {
    var results = [];
    var tokenRegExp = /\s*([A-Za-z]+|[0-9]+|\S)\s*/g;

    var m;
    while ((m = tokenRegExp.exec(code)) !== null)
        results.push(m[1]);
    return results;
}

// Let’s test as we go!
var assert = require('assert');
assert.deepEqual(tokenize("123\n"), ["123"]);
assert.deepEqual(tokenize("2+2"), ["2", "+", "2"]);
assert.deepEqual(tokenize("+-*/"), ["+", "-", "*", "/"]);
assert.deepEqual(tokenize("   1   * 24 +\n\n  pi"), ["1", "*", "24", "+", "pi"]);
assert.deepEqual(tokenize("()"), ["(", ")"]);
assert.deepEqual(tokenize("    "), []);



// Here are a few helper functions for working with tokens. To keep things
// simple, a number is any sequence of digits.
function isNumber(token) {
    return token !== undefined && token.match(/^[0-9]+$/) !== null;
}

// And a *name*, or identifier, is any sequence of letters.
function isName(token) {
    return token !== undefined && token.match(/^[A-Za-z]+$/) !== null;
}

// Tests.
assert(isNumber("123"));
assert(!isNumber("x"));
assert(!isNumber("-"));
assert(isName("xyz"));
assert(!isName("+"));


// ## Act Three – Parser output

// The parser’s only job is to *decode* the input.
//
// *Executing* a program is this object’s job. I’m putting this
// right up front so you can see what the language can actually do,
// before reading on.
//
// The parser will call these six methods as it decodes each
// piece of the input code.
//
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



// ## Act Two – The parser

// Parse the given string `code` as an expression in our little language.
//
function parse(code, out) {
    // Break the input into tokens.
    var tokens = tokenize(code);

    // The parser will do a single left-to-right pass over `tokens`, with no
    // backtracking. `position` is the index of the next token. Start at
    // 0. We’ll increment this as we go.
    var position = 0;

    // `peek()` returns the next token without advancing `position`.
    function peek() {
        return tokens[position];
    }

    // `consume(token)` consumes one token, moving `position` to point to the next one.
    function consume(token) {
        assert.strictEqual(token, tokens[position]);
        position++;
    }

    // Now we have the functions that are actually responsible for parsing.
    // This is the cool part. Each group of syntax rules is translated to one
    // function.

    // Parse a *PrimaryExpr*—that is, tokens matching one of the three syntax
    // rules below. Whatever kind of expression we find, we return the result
    // of some `out.something()` method.
    //
    // <div style="margin-left: 2em">
    //  <div>*PrimaryExpr* **:**</div>
    //  <div style="margin-left: 2em">
    //   <div>*Number*</div>
    //   <div>*Name*</div>
    //   <div><b><code>(</code></b> *Expr* <b><code>)</code></b></div>
    //  </div>
    // </div>
    function parsePrimaryExpr() {
        var t = peek();

        if (isNumber(t)) {
            consume(t);
            return out.number(t);
        } else if (isName(t)) {
            consume(t);
            return out.name(t);
        } else if (t === "(") {
            consume(t);
            var expr = parseExpr();
            if (peek() !== ")")
                throw new SyntaxError("expected )");
            consume(")");
            return expr;
        } else {
            // If we get here, the next token doesn’t match any of the three
            // rules. So it’s an error.
            throw new SyntaxError("expected a number, a variable, or parentheses");
        }
    }

    // <div style="margin-left: 2em; margin-bottom: 1em">
    //  *MulExpr* **:**
    //  <div style="margin-left: 2em">
    //   <div>*PrimaryExpr* ( <b><code>\*</code></b> *PrimaryExpr* | <b><code>/</code></b> *PrimaryExpr* )<sup>\*</sup></div>
    //  </div>
    // </div>
    function parseMulExpr() {
        var expr = parsePrimaryExpr();
        var t = peek();
        while (t === "*" || t === "/") {
            consume(t);
            var rhs = parsePrimaryExpr();
            if (t === "*")
                expr = out.mul(expr, rhs);
            else
                expr = out.div(expr, rhs);
            t = peek();
        }
        return expr;
    }

    // <div style="margin-left: 2em">
    //  *Expr* **:**
    //  <div style="margin-left: 2em">
    //   <div>*MulExpr* ( <b><code>+</code></b> *MulExpr* | <b><code>-</code></b> *MulExpr* )<sup>\*</sup></div>
    //  </div>
    // </div>
    function parseExpr() {
        var expr = parseMulExpr();
        var t = peek();
        while (t === "+" || t === "-") {
            consume(t);
            var rhs = parseMulExpr();
            if (t === "+")
                expr = out.add(expr, rhs);
            else
                expr = out.sub(expr, rhs);
            t = peek();
        }
        return expr;
    }

    // Now all that remains, really, is to call `parseExpr()` to parse an *Expr*.
    var result = parseExpr();

    // Well, one more thing. Make sure `parseExpr()` consumed *all* the
    // input. If it didn’t, that means the next token didn’t match any syntax
    // rule, which is an error.
    if (position !== tokens.length)
        throw new SyntaxError("unexpected '" + peek() + "'");
    return result;
}

assert.strictEqual(parse("2 + 2", calculator), 4);
assert.strictEqual(parse("3 * 4 * 5", calculator), 60);
assert.strictEqual(parse("5 * (2 + 2)", calculator), 20);
