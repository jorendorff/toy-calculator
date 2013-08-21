Toy calculator for my talk on compilers at Coderfaire 2013.
[Try it out.](http://jorendorff.github.io/calc/calculator.html)


The grammar is:

    PrimaryExpr:
        Number
        Name
        ( Expr )

    MulExpr :
        NegExpr
        NegExpr * NegExpr ...
        NegExpr / NegExpr ...

    Expr :
        MulExpr
        MulExpr + MulExpr
        MulExpr - MulExpr
        
