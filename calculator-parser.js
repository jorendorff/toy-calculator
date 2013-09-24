// # calculator-parser.js
//
// a simple calculator language

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


// ## Part One – Breaking code down into tokens

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


// ## Part Two – The parser

// The parser’s job is to decode the input and build a collection of objects
// that represent the code.
//
// (This is just like the way a Web browser decodes an HTML file and builds the
// DOM. The part that does that is called the HTML parser.)

// Parse the given string `code` as an expression in our little language.
//
function parse(code) {
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
    // rules below. Whatever kind of expression we find, we return the corresponding
    // JS object.
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
            return {type: "number", value: t};
        } else if (isName(t)) {
            consume(t);
            return {type: "name", id: t};
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
            expr = {type: t, left: expr, right: rhs};
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
            expr = {type: t, left: expr, right: rhs};
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

// And test it.
assert.deepEqual(
    parse("(1 + 2) / 3"),
    {
        type: "/",
        left: {
            type: "+",
            left: {type: "number", value: "1"},
            right: {type: "number", value: "2"}
        },
        right: {type: "number", value: "3"}
    });
