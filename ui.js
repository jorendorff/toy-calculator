// This code was lifted from http://www.squarefree.com/shell/shell.html
// Probably originally by Jesse Ruderman.

var
    histList = [""],
    histPos = 0,
    _win, // a top-level context
    question,
    _in,
    _out,
    tooManyMatches = null,
    lastError = null;

function refocus() {
    _in.blur(); // Needed for Mozilla to scroll correctly.
    _in.focus();
}

var mode = 'calculator';

function init() {
    _in = document.getElementById("input");
    _out = document.getElementById("output");
    _win = window;
    _win.Shell = window;
    recalculateInputHeight();
    refocus();

    var sourceCode = document.getElementById("sourcecode");
    function setMode(newMode) {
        mode = newMode;

        while (sourceCode.lastChild)
            sourceCode.removeChild(sourceCode.lastChild);
        sourceCode.appendChild(document.createTextNode(parseModes[mode].toString()));
    }

    setMode('calc');

    var radios = document.getElementsByTagName("input");
    for (var i = 0; i < radios.length; i++) {
        var e = radios[i];
        if (e.type == "radio") {
            e.addEventListener("click", function () {
                setMode(this.value);
                setTimeout(refocus, 0);
                return true;
            });
            if (e.value == 'calc')
                e.checked = true;
        }
    }
}

// Unless the user is selected something, refocus the textbox.
// (requested by caillon, brendan, asa)
function keepFocusInTextbox(e) {
    var g = e.srcElement ? e.srcElement : e.target; // IE vs. standard

    while (!g.tagName)
        g = g.parentNode;
    var t = g.tagName.toUpperCase();
    if (t=="A" || t=="INPUT")
        return;

    if (window.getSelection) {
        // Mozilla
        if (String(window.getSelection()))
            return;
    } else if (document.getSelection) {
        // Opera? Netscape 4?
        if (document.getSelection())
            return;
    } else {
        // IE
        if ( document.selection.createRange().text )
            return;
    }

    refocus();
}

function inputKeydown(e) {
    // Use onkeydown because IE doesn't support onkeypress for arrow keys

    //alert(e.keyCode + " ^ " + e.keycode);

    if (e.shiftKey && e.keyCode == 13) { // shift-enter
        // don't do anything; allow the shift-enter to insert a line break as normal
    } else if (e.keyCode == 13) { // enter
        // execute the input on enter
        try { go(); } catch(er) { alert(er); };
        setTimeout(function() { _in.value = ""; }, 0); // can't preventDefault on input, so clear it later
    } else if (e.keyCode == 38) { // up
        // go up in history if at top or ctrl-up
        if (e.ctrlKey || caretInFirstLine(_in))
            hist(true);
    } else if (e.keyCode == 40) { // down
        // go down in history if at end or ctrl-down
        if (e.ctrlKey || caretInLastLine(_in))
            hist(false);
    } else if (e.keyCode == 9) { // tab
        setTimeout(function() { refocus(); }, 0); // refocus because tab was hit
    } else { }

    setTimeout(recalculateInputHeight, 0);

    //return true;
}

function caretInFirstLine(textbox) {
    // IE doesn't support selectionStart/selectionEnd
    if (textbox.selectionStart == undefined)
        return true;

    var firstLineBreak = textbox.value.indexOf("\n");

    return ((firstLineBreak == -1) || (textbox.selectionStart <= firstLineBreak));
}

function caretInLastLine(textbox) {
    // IE doesn't support selectionStart/selectionEnd
    if (textbox.selectionEnd == undefined)
        return true;

    var lastLineBreak = textbox.value.lastIndexOf("\n");

    return (textbox.selectionEnd > lastLineBreak);
}

function recalculateInputHeight() {
    var rows = _in.value.split(/\n/).length
        + 1 // prevent scrollbar flickering in Mozilla
        + (window.opera ? 1 : 0); // leave room for scrollbar in Opera

    if (_in.rows != rows) // without this check, it is impossible to select text in Opera 7.60 or Opera 8.0.
        _in.rows = rows;
}

function writeNode(type, node) {
    var newdiv = document.createElement("div");
    newdiv.className = type;
    newdiv.appendChild(node);
    _out.appendChild(newdiv);
    return newdiv;
}

function println(s, type) {
    s = String(s);
    if (s)
        return writeNode(type, document.createTextNode(s));
}

function printWithRunin(h, s, type) {
    var div = println(s, type);
    var head = document.createElement("strong");
    head.appendChild(document.createTextNode(h + ": "));
    div.insertBefore(head, div.firstChild);
}

function hist(up) {
    // histList[0] = first command entered, [1] = second, etc.
    // type something, press up --> thing typed is now in "limbo"
    // (last item in histList) and should be reachable by pressing
    // down again.

    var L = histList.length;

    if (L == 1)
        return;

    if (up) {
        if (histPos == L-1) {
            // Save this entry in case the user hits the down key.
            histList[histPos] = _in.value;
        }

        if (histPos > 0) {
            histPos--;
            // Use a timeout to prevent up from moving cursor within new text
            // Set to nothing first for the same reason
            setTimeout(
                function() {
                    _in.value = '';
                    _in.value = histList[histPos];
                    var caretPos = _in.value.length;
                    if (_in.setSelectionRange)
                        _in.setSelectionRange(caretPos, caretPos);
                },
                0
            );
        }
    } else { // down
        if (histPos < L-1) {
            histPos++;
            _in.value = histList[histPos];
        } else if (histPos == L-1) {
            // Already on the current entry: clear but save
            if (_in.value) {
                histList[histPos] = _in.value;
                ++histPos;
                _in.value = "";
            }
        }
    }
}

function printQuestion(q) {
    println(q, "input");
}

function printAnswer(a) {
    if (a !== undefined)
        println(a, "normalOutput");
}

function printError(er) {
    var lineNumberString;

    lastError = er; // for debugging the shell
    if (er.name) {
        // lineNumberString should not be "", to avoid a very wacky bug in IE 6.
        lineNumberString = (er.lineNumber != undefined) ? (" on line " + er.lineNumber + ": ") : ": ";
        println(er.name + lineNumberString + er.message, "error"); // Because IE doesn't have error.toString.
    } else {
        println(er, "error"); // Because security errors in Moz /only/ have toString.
    }
}

// Example: Taylor series for sin:
// x * (1 - x*x/(2*3) * (1 - x*x/(4*5) * (1 - x*x/(6*7) * (1 - x*x/(8*9) * (1 - x*x/(10*11) * (1 - x*x/(12*13)))))))
function showPlot(fn) {
    var c = document.createElement('canvas');
    c.width = 600;
    c.height = 400;
    writeNode("normalOutput", c);
    var ctx = c.getContext("2d");

    var rawData = [], labels = [];
    for (var i = 0; i <= 100; i++) {
        var x = (i - 50) / 20;
        rawData[i] = fn(x);
        if (i % 10 == 0)
            labels[i] = x;
        else
            labels[i] = "";
    }

    var chart = new Chart(ctx).Line({
        labels: labels,
        datasets: [
	    {
		fillColor : "rgba(151,187,205,0.5)",
		strokeColor : "rgba(151,187,205,1)",
		data : rawData
            }
        ]
    }, {
        bezierCurve: false,
        pointDot: false,
        animation: false
    });
}

function showComplexPlot(fn) {
    var WIDTH = 401, HEIGHT = 401;
    var c = document.createElement('canvas');
    c.width = WIDTH;
    c.height = HEIGHT;
    writeNode("normalOutput", c);
    var ctx = c.getContext('2d');
    var imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    var arr = imageData.data;

    var i = 0;
    for (var yi = 0; yi < HEIGHT; yi++) {
        var z_im = ((HEIGHT - 1) / 2 - yi) * (6 / HEIGHT);
        for (var xi = 0; xi < WIDTH; xi++) {
            var z_re = (xi - (WIDTH - 1) / 2) * (6 / WIDTH);
            var result = fn(z_re, z_im);

            var rabs = Math.sqrt(result.re*result.re + result.im*result.im);

            var h = Math.atan2(result.im, result.re) / (2*Math.PI);
            var s = 1.0;
            var l;
            if (result.re !== result.re || result.im !== result.im) {
                l = 1;
            } else {
                l = 0.5 + Math.log(rabs + 0.5) / 3;
                if (l > 1)
                    l = 1;
                else if (l < 0)
                    l = 0;
            }

            var m2 = l <= 0.5 ? l * (s + 1) : l + s - l * s;
            var m1 = l * 2 - m2;

            function hue(h) {
                h = h < 0 ? h + 1 : (h > 1 ? h - 1 : h);
                if (h * 6 < 1) return m1 + (m2 - m1) * h * 6;
                else if (h * 2 < 1) return m2;
                else if (h * 3 < 2) return m1 + (m2 - m1) * (2/3 - h) * 6;
                else return m1;
            }

            arr[i] = Math.round(255 * hue(h + 1/3));
            arr[i + 1] = Math.round(255 * hue(h));
            arr[i + 2] = Math.round(255 * hue(h - 1/3));
            arr[i + 3] = 255;
            i += 4;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}


var mode = 'calc';

function go() {
    question = _in.value;

    if (question == "")
        return;

    histList[histList.length-1] = question;
    histList[histList.length] = "";
    histPos = histList.length - 1;

    _in.value='';
    recalculateInputHeight();
    printQuestion(question);

    if (_win.closed) {
        printError("Target window has been closed.");
        return;
    }

    if (!("Shell" in _win))
        initTarget(); // silent

    try {
        var result = parseModes[mode](question);
        switch (mode) {
        case 'calc':
            Shell.printAnswer(result);
            break;

        case 'fraction':
            Shell.printAnswer(result);
            break;

        case 'blocks':
            writeNode("normalOutput", result);
            break;

        case 'json':
            Shell.printAnswer(JSON.stringify(result, undefined, "    "));
            break;

        case 'mathml':
            writeNode("normalOutput", result.element);
            break;

        case 'graph':
            showPlot(result);
            break;

        case 'complex':
            showComplexPlot(result);
            break;
        }
    } catch (exc) {
        Shell.printError(exc);
    }
    setTimeout(Shell.refocus, 0);
}

