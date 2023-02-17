// Generated from java-escape by ANTLR 4.11.1
// jshint ignore: start
import antlr4 from 'antlr4';
import FileDescVisitor from './FileDescVisitor';

const serializedATN = [4,1,33,239,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,
4,2,5,7,5,2,6,7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,
2,13,7,13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,
20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,26,2,27,
7,27,1,0,3,0,58,8,0,1,0,3,0,61,8,0,1,0,3,0,64,8,0,1,0,1,0,1,1,1,1,1,1,5,
1,71,8,1,10,1,12,1,74,9,1,1,2,1,2,1,2,3,2,79,8,2,1,3,3,3,82,8,3,1,3,1,3,
1,4,3,4,87,8,4,1,4,1,4,1,4,1,4,1,4,3,4,94,8,4,1,5,1,5,1,5,1,5,1,5,3,5,101,
8,5,1,6,1,6,1,6,3,6,106,8,6,1,6,1,6,1,7,1,7,1,7,1,7,1,7,1,8,1,8,1,8,1,8,
1,8,1,8,1,8,1,9,1,9,1,9,3,9,125,8,9,1,9,1,9,1,10,1,10,1,10,1,10,1,10,1,11,
1,11,1,11,1,11,1,11,1,12,1,12,1,12,1,12,1,12,1,13,1,13,1,13,1,13,1,13,1,
14,1,14,1,14,1,14,1,14,1,15,1,15,1,15,5,15,157,8,15,10,15,12,15,160,9,15,
1,16,1,16,1,16,5,16,165,8,16,10,16,12,16,168,9,16,1,17,1,17,1,17,3,17,173,
8,17,1,18,3,18,176,8,18,1,18,1,18,1,18,1,18,1,18,1,18,1,18,3,18,185,8,18,
1,19,1,19,1,19,5,19,190,8,19,10,19,12,19,193,9,19,1,20,1,20,4,20,197,8,20,
11,20,12,20,198,1,21,1,21,3,21,203,8,21,1,22,1,22,3,22,207,8,22,1,23,1,23,
1,23,1,23,1,24,1,24,1,24,1,24,1,24,1,24,1,24,3,24,220,8,24,1,24,1,24,1,24,
1,24,1,24,1,24,5,24,228,8,24,10,24,12,24,231,9,24,1,25,1,25,1,26,1,26,1,
27,1,27,1,27,0,1,48,28,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,
36,38,40,42,44,46,48,50,52,54,0,3,1,0,6,7,1,0,22,23,1,0,24,25,241,0,57,1,
0,0,0,2,67,1,0,0,0,4,78,1,0,0,0,6,81,1,0,0,0,8,86,1,0,0,0,10,100,1,0,0,0,
12,105,1,0,0,0,14,109,1,0,0,0,16,114,1,0,0,0,18,121,1,0,0,0,20,128,1,0,0,
0,22,133,1,0,0,0,24,138,1,0,0,0,26,143,1,0,0,0,28,148,1,0,0,0,30,153,1,0,
0,0,32,161,1,0,0,0,34,172,1,0,0,0,36,175,1,0,0,0,38,186,1,0,0,0,40,196,1,
0,0,0,42,202,1,0,0,0,44,206,1,0,0,0,46,208,1,0,0,0,48,219,1,0,0,0,50,232,
1,0,0,0,52,234,1,0,0,0,54,236,1,0,0,0,56,58,5,28,0,0,57,56,1,0,0,0,57,58,
1,0,0,0,58,60,1,0,0,0,59,61,3,2,1,0,60,59,1,0,0,0,60,61,1,0,0,0,61,63,1,
0,0,0,62,64,5,28,0,0,63,62,1,0,0,0,63,64,1,0,0,0,64,65,1,0,0,0,65,66,5,0,
0,1,66,1,1,0,0,0,67,72,3,4,2,0,68,69,5,28,0,0,69,71,3,4,2,0,70,68,1,0,0,
0,71,74,1,0,0,0,72,70,1,0,0,0,72,73,1,0,0,0,73,3,1,0,0,0,74,72,1,0,0,0,75,
79,3,8,4,0,76,79,3,10,5,0,77,79,3,6,3,0,78,75,1,0,0,0,78,76,1,0,0,0,78,77,
1,0,0,0,79,5,1,0,0,0,80,82,3,12,6,0,81,80,1,0,0,0,81,82,1,0,0,0,82,83,1,
0,0,0,83,84,5,27,0,0,84,7,1,0,0,0,85,87,3,12,6,0,86,85,1,0,0,0,86,87,1,0,
0,0,87,88,1,0,0,0,88,89,5,32,0,0,89,90,5,26,0,0,90,93,3,36,18,0,91,92,5,
26,0,0,92,94,3,38,19,0,93,91,1,0,0,0,93,94,1,0,0,0,94,9,1,0,0,0,95,101,3,
22,11,0,96,101,3,26,13,0,97,101,3,24,12,0,98,101,3,20,10,0,99,101,3,28,14,
0,100,95,1,0,0,0,100,96,1,0,0,0,100,97,1,0,0,0,100,98,1,0,0,0,100,99,1,0,
0,0,101,11,1,0,0,0,102,106,3,14,7,0,103,106,3,16,8,0,104,106,3,18,9,0,105,
102,1,0,0,0,105,103,1,0,0,0,105,104,1,0,0,0,106,107,1,0,0,0,107,108,5,1,
0,0,108,13,1,0,0,0,109,110,5,16,0,0,110,111,5,2,0,0,111,112,3,30,15,0,112,
113,5,3,0,0,113,15,1,0,0,0,114,115,5,14,0,0,115,116,5,2,0,0,116,117,5,32,
0,0,117,118,5,4,0,0,118,119,3,32,16,0,119,120,5,3,0,0,120,17,1,0,0,0,121,
122,5,15,0,0,122,124,5,2,0,0,123,125,3,42,21,0,124,123,1,0,0,0,124,125,1,
0,0,0,125,126,1,0,0,0,126,127,5,3,0,0,127,19,1,0,0,0,128,129,5,17,0,0,129,
130,5,2,0,0,130,131,3,30,15,0,131,132,5,3,0,0,132,21,1,0,0,0,133,134,5,19,
0,0,134,135,5,2,0,0,135,136,3,42,21,0,136,137,5,3,0,0,137,23,1,0,0,0,138,
139,5,21,0,0,139,140,5,2,0,0,140,141,3,42,21,0,141,142,5,3,0,0,142,25,1,
0,0,0,143,144,5,20,0,0,144,145,5,2,0,0,145,146,3,42,21,0,146,147,5,3,0,0,
147,27,1,0,0,0,148,149,5,18,0,0,149,150,5,2,0,0,150,151,3,30,15,0,151,152,
5,3,0,0,152,29,1,0,0,0,153,158,3,44,22,0,154,155,5,5,0,0,155,157,3,44,22,
0,156,154,1,0,0,0,157,160,1,0,0,0,158,156,1,0,0,0,158,159,1,0,0,0,159,31,
1,0,0,0,160,158,1,0,0,0,161,166,3,34,17,0,162,163,5,5,0,0,163,165,3,34,17,
0,164,162,1,0,0,0,165,168,1,0,0,0,166,164,1,0,0,0,166,167,1,0,0,0,167,33,
1,0,0,0,168,166,1,0,0,0,169,173,3,52,26,0,170,173,3,50,25,0,171,173,3,54,
27,0,172,169,1,0,0,0,172,170,1,0,0,0,172,171,1,0,0,0,173,35,1,0,0,0,174,
176,7,0,0,0,175,174,1,0,0,0,175,176,1,0,0,0,176,184,1,0,0,0,177,185,3,42,
21,0,178,179,5,8,0,0,179,180,3,42,21,0,180,181,5,26,0,0,181,182,3,42,21,
0,182,183,5,9,0,0,183,185,1,0,0,0,184,177,1,0,0,0,184,178,1,0,0,0,185,37,
1,0,0,0,186,191,5,32,0,0,187,188,5,5,0,0,188,190,5,32,0,0,189,187,1,0,0,
0,190,193,1,0,0,0,191,189,1,0,0,0,191,192,1,0,0,0,192,39,1,0,0,0,193,191,
1,0,0,0,194,197,3,46,23,0,195,197,5,32,0,0,196,194,1,0,0,0,196,195,1,0,0,
0,197,198,1,0,0,0,198,196,1,0,0,0,198,199,1,0,0,0,199,41,1,0,0,0,200,203,
3,46,23,0,201,203,3,54,27,0,202,200,1,0,0,0,202,201,1,0,0,0,203,43,1,0,0,
0,204,207,3,46,23,0,205,207,3,52,26,0,206,204,1,0,0,0,206,205,1,0,0,0,207,
45,1,0,0,0,208,209,5,10,0,0,209,210,3,48,24,0,210,211,5,11,0,0,211,47,1,
0,0,0,212,213,6,24,-1,0,213,220,5,32,0,0,214,220,3,54,27,0,215,216,5,2,0,
0,216,217,3,48,24,0,217,218,5,3,0,0,218,220,1,0,0,0,219,212,1,0,0,0,219,
214,1,0,0,0,219,215,1,0,0,0,220,229,1,0,0,0,221,222,10,2,0,0,222,223,7,1,
0,0,223,228,3,48,24,3,224,225,10,1,0,0,225,226,7,2,0,0,226,228,3,48,24,2,
227,221,1,0,0,0,227,224,1,0,0,0,228,231,1,0,0,0,229,227,1,0,0,0,229,230,
1,0,0,0,230,49,1,0,0,0,231,229,1,0,0,0,232,233,5,29,0,0,233,51,1,0,0,0,234,
235,5,30,0,0,235,53,1,0,0,0,236,237,5,31,0,0,237,55,1,0,0,0,24,57,60,63,
72,78,81,86,93,100,105,124,158,166,172,175,184,191,196,198,202,206,219,227,
229];


const atn = new antlr4.atn.ATNDeserializer().deserialize(serializedATN);

const decisionsToDFA = atn.decisionToState.map( (ds, index) => new antlr4.dfa.DFA(ds, index) );

const sharedContextCache = new antlr4.PredictionContextCache();

export default class FileDescParser extends antlr4.Parser {

    static grammarFileName = "java-escape";
    static literalNames = [ null, "':'", "'('", "')'", "'is'", "'|'", "'>'", 
                            "'<'", "'['", "']'", "'${'", "'}'", null, null, 
                            "'if'", "'loop'", "'while'", "'find'", "'backFind'", 
                            "'back'", "'next'", "'goto'", "'*'", "'/'", 
                            "'+'", "'-'", "','" ];
    static symbolicNames = [ null, null, null, null, null, null, null, null, 
                             null, null, null, null, "BLOCK_COMMENT", "LINE_COMMENT", 
                             "IF", "LOOP", "WHILE", "FIND", "BACKFIND", 
                             "BACK", "NEXT", "GOTO", "ASTERISK", "SLASH", 
                             "PLUS", "MINUS", "PART_SPLIT", "GROUP_TITLE", 
                             "NEWLINE", "STRING", "BYTE_VALUE", "NUMBER", 
                             "VAR", "WHITESPACE" ];
    static ruleNames = [ "program", "fileData", "line", "groupLine", "fieldLine", 
                         "commandLine", "scopeCommandExpr", "whileCommand", 
                         "ifCommand", "loopCommand", "findCommand", "backCommand", 
                         "gotoCommand", "nextCommand", "backFindCommand", 
                         "multiByteValue", "multiMatchDataValue", "matchDataExpr", 
                         "offsetExpr", "dataFormatExpr", "stringValue", 
                         "numberValue", "byteValue", "varExpr", "calcExpr", 
                         "string", "byteData", "number" ];

    constructor(input) {
        super(input);
        this._interp = new antlr4.atn.ParserATNSimulator(this, atn, decisionsToDFA, sharedContextCache);
        this.ruleNames = FileDescParser.ruleNames;
        this.literalNames = FileDescParser.literalNames;
        this.symbolicNames = FileDescParser.symbolicNames;
    }

    get atn() {
        return atn;
    }

    sempred(localctx, ruleIndex, predIndex) {
    	switch(ruleIndex) {
    	case 24:
    	    		return this.calcExpr_sempred(localctx, predIndex);
        default:
            throw "No predicate with index:" + ruleIndex;
       }
    }

    calcExpr_sempred(localctx, predIndex) {
    	switch(predIndex) {
    		case 0:
    			return this.precpred(this._ctx, 2);
    		case 1:
    			return this.precpred(this._ctx, 1);
    		default:
    			throw "No predicate with index:" + predIndex;
    	}
    };




	program() {
	    let localctx = new ProgramContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 0, FileDescParser.RULE_program);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 57;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,0,this._ctx);
	        if(la_===1) {
	            this.state = 56;
	            this.match(FileDescParser.NEWLINE);

	        }
	        this.state = 60;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(((((_la - 14)) & ~0x1f) == 0 && ((1 << (_la - 14)) & 270591) !== 0)) {
	            this.state = 59;
	            this.fileData();
	        }

	        this.state = 63;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===28) {
	            this.state = 62;
	            this.match(FileDescParser.NEWLINE);
	        }

	        this.state = 65;
	        this.match(FileDescParser.EOF);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	fileData() {
	    let localctx = new FileDataContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 2, FileDescParser.RULE_fileData);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 67;
	        this.line();
	        this.state = 72;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,3,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                this.state = 68;
	                this.match(FileDescParser.NEWLINE);
	                this.state = 69;
	                this.line(); 
	            }
	            this.state = 74;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,3,this._ctx);
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	line() {
	    let localctx = new LineContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 4, FileDescParser.RULE_line);
	    try {
	        this.state = 78;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,4,this._ctx);
	        switch(la_) {
	        case 1:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 75;
	            this.fieldLine();
	            break;

	        case 2:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 76;
	            this.commandLine();
	            break;

	        case 3:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 77;
	            this.groupLine();
	            break;

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	groupLine() {
	    let localctx = new GroupLineContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 6, FileDescParser.RULE_groupLine);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 81;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) == 0 && ((1 << _la) & 114688) !== 0)) {
	            this.state = 80;
	            this.scopeCommandExpr();
	        }

	        this.state = 83;
	        this.match(FileDescParser.GROUP_TITLE);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	fieldLine() {
	    let localctx = new FieldLineContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 8, FileDescParser.RULE_fieldLine);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 86;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if((((_la) & ~0x1f) == 0 && ((1 << _la) & 114688) !== 0)) {
	            this.state = 85;
	            this.scopeCommandExpr();
	        }

	        this.state = 88;
	        this.match(FileDescParser.VAR);
	        this.state = 89;
	        this.match(FileDescParser.PART_SPLIT);
	        this.state = 90;
	        this.offsetExpr();
	        this.state = 93;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===26) {
	            this.state = 91;
	            this.match(FileDescParser.PART_SPLIT);
	            this.state = 92;
	            this.dataFormatExpr();
	        }

	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	commandLine() {
	    let localctx = new CommandLineContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 10, FileDescParser.RULE_commandLine);
	    try {
	        this.state = 100;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 19:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 95;
	            this.backCommand();
	            break;
	        case 20:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 96;
	            this.nextCommand();
	            break;
	        case 21:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 97;
	            this.gotoCommand();
	            break;
	        case 17:
	            this.enterOuterAlt(localctx, 4);
	            this.state = 98;
	            this.findCommand();
	            break;
	        case 18:
	            this.enterOuterAlt(localctx, 5);
	            this.state = 99;
	            this.backFindCommand();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	scopeCommandExpr() {
	    let localctx = new ScopeCommandExprContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 12, FileDescParser.RULE_scopeCommandExpr);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 105;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 16:
	            this.state = 102;
	            this.whileCommand();
	            break;
	        case 14:
	            this.state = 103;
	            this.ifCommand();
	            break;
	        case 15:
	            this.state = 104;
	            this.loopCommand();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	        this.state = 107;
	        this.match(FileDescParser.T__0);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	whileCommand() {
	    let localctx = new WhileCommandContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 14, FileDescParser.RULE_whileCommand);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 109;
	        this.match(FileDescParser.WHILE);
	        this.state = 110;
	        this.match(FileDescParser.T__1);
	        this.state = 111;
	        this.multiByteValue();
	        this.state = 112;
	        this.match(FileDescParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	ifCommand() {
	    let localctx = new IfCommandContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 16, FileDescParser.RULE_ifCommand);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 114;
	        this.match(FileDescParser.IF);
	        this.state = 115;
	        this.match(FileDescParser.T__1);
	        this.state = 116;
	        this.match(FileDescParser.VAR);
	        this.state = 117;
	        this.match(FileDescParser.T__3);
	        this.state = 118;
	        this.multiMatchDataValue();
	        this.state = 119;
	        this.match(FileDescParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	loopCommand() {
	    let localctx = new LoopCommandContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 18, FileDescParser.RULE_loopCommand);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 121;
	        this.match(FileDescParser.LOOP);
	        this.state = 122;
	        this.match(FileDescParser.T__1);
	        this.state = 124;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===10 || _la===31) {
	            this.state = 123;
	            this.numberValue();
	        }

	        this.state = 126;
	        this.match(FileDescParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	findCommand() {
	    let localctx = new FindCommandContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 20, FileDescParser.RULE_findCommand);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 128;
	        this.match(FileDescParser.FIND);
	        this.state = 129;
	        this.match(FileDescParser.T__1);
	        this.state = 130;
	        this.multiByteValue();
	        this.state = 131;
	        this.match(FileDescParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	backCommand() {
	    let localctx = new BackCommandContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 22, FileDescParser.RULE_backCommand);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 133;
	        this.match(FileDescParser.BACK);
	        this.state = 134;
	        this.match(FileDescParser.T__1);
	        this.state = 135;
	        this.numberValue();
	        this.state = 136;
	        this.match(FileDescParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	gotoCommand() {
	    let localctx = new GotoCommandContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 24, FileDescParser.RULE_gotoCommand);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 138;
	        this.match(FileDescParser.GOTO);
	        this.state = 139;
	        this.match(FileDescParser.T__1);
	        this.state = 140;
	        this.numberValue();
	        this.state = 141;
	        this.match(FileDescParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	nextCommand() {
	    let localctx = new NextCommandContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 26, FileDescParser.RULE_nextCommand);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 143;
	        this.match(FileDescParser.NEXT);
	        this.state = 144;
	        this.match(FileDescParser.T__1);
	        this.state = 145;
	        this.numberValue();
	        this.state = 146;
	        this.match(FileDescParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	backFindCommand() {
	    let localctx = new BackFindCommandContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 28, FileDescParser.RULE_backFindCommand);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 148;
	        this.match(FileDescParser.BACKFIND);
	        this.state = 149;
	        this.match(FileDescParser.T__1);
	        this.state = 150;
	        this.multiByteValue();
	        this.state = 151;
	        this.match(FileDescParser.T__2);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	multiByteValue() {
	    let localctx = new MultiByteValueContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 30, FileDescParser.RULE_multiByteValue);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 153;
	        this.byteValue();
	        this.state = 158;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===5) {
	            this.state = 154;
	            this.match(FileDescParser.T__4);
	            this.state = 155;
	            this.byteValue();
	            this.state = 160;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	multiMatchDataValue() {
	    let localctx = new MultiMatchDataValueContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 32, FileDescParser.RULE_multiMatchDataValue);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 161;
	        this.matchDataExpr();
	        this.state = 166;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===5) {
	            this.state = 162;
	            this.match(FileDescParser.T__4);
	            this.state = 163;
	            this.matchDataExpr();
	            this.state = 168;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	matchDataExpr() {
	    let localctx = new MatchDataExprContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 34, FileDescParser.RULE_matchDataExpr);
	    try {
	        this.state = 172;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 30:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 169;
	            this.byteData();
	            break;
	        case 29:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 170;
	            this.string();
	            break;
	        case 31:
	            this.enterOuterAlt(localctx, 3);
	            this.state = 171;
	            this.number();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	offsetExpr() {
	    let localctx = new OffsetExprContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 36, FileDescParser.RULE_offsetExpr);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 175;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        if(_la===6 || _la===7) {
	            this.state = 174;
	            _la = this._input.LA(1);
	            if(!(_la===6 || _la===7)) {
	            this._errHandler.recoverInline(this);
	            }
	            else {
	            	this._errHandler.reportMatch(this);
	                this.consume();
	            }
	        }

	        this.state = 184;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 10:
	        case 31:
	            this.state = 177;
	            this.numberValue();
	            break;
	        case 8:
	            this.state = 178;
	            this.match(FileDescParser.T__7);
	            this.state = 179;
	            this.numberValue();
	            this.state = 180;
	            this.match(FileDescParser.PART_SPLIT);
	            this.state = 181;
	            this.numberValue();
	            this.state = 182;
	            this.match(FileDescParser.T__8);
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	dataFormatExpr() {
	    let localctx = new DataFormatExprContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 38, FileDescParser.RULE_dataFormatExpr);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 186;
	        this.match(FileDescParser.VAR);
	        this.state = 191;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===5) {
	            this.state = 187;
	            this.match(FileDescParser.T__4);
	            this.state = 188;
	            this.match(FileDescParser.VAR);
	            this.state = 193;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	stringValue() {
	    let localctx = new StringValueContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 40, FileDescParser.RULE_stringValue);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 196; 
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        do {
	            this.state = 196;
	            this._errHandler.sync(this);
	            switch(this._input.LA(1)) {
	            case 10:
	                this.state = 194;
	                this.varExpr();
	                break;
	            case 32:
	                this.state = 195;
	                this.match(FileDescParser.VAR);
	                break;
	            default:
	                throw new antlr4.error.NoViableAltException(this);
	            }
	            this.state = 198; 
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        } while(_la===10 || _la===32);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	numberValue() {
	    let localctx = new NumberValueContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 42, FileDescParser.RULE_numberValue);
	    try {
	        this.state = 202;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 10:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 200;
	            this.varExpr();
	            break;
	        case 31:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 201;
	            this.number();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	byteValue() {
	    let localctx = new ByteValueContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 44, FileDescParser.RULE_byteValue);
	    try {
	        this.state = 206;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 10:
	            this.enterOuterAlt(localctx, 1);
	            this.state = 204;
	            this.varExpr();
	            break;
	        case 30:
	            this.enterOuterAlt(localctx, 2);
	            this.state = 205;
	            this.byteData();
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	varExpr() {
	    let localctx = new VarExprContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 46, FileDescParser.RULE_varExpr);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 208;
	        this.match(FileDescParser.T__9);
	        this.state = 209;
	        this.calcExpr(0);
	        this.state = 210;
	        this.match(FileDescParser.T__10);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}


	calcExpr(_p) {
		if(_p===undefined) {
		    _p = 0;
		}
	    const _parentctx = this._ctx;
	    const _parentState = this.state;
	    let localctx = new CalcExprContext(this, this._ctx, _parentState);
	    let _prevctx = localctx;
	    const _startState = 48;
	    this.enterRecursionRule(localctx, 48, FileDescParser.RULE_calcExpr, _p);
	    var _la = 0; // Token type
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 219;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 32:
	            this.state = 213;
	            this.match(FileDescParser.VAR);
	            break;
	        case 31:
	            this.state = 214;
	            this.number();
	            break;
	        case 2:
	            this.state = 215;
	            this.match(FileDescParser.T__1);
	            this.state = 216;
	            this.calcExpr(0);
	            this.state = 217;
	            this.match(FileDescParser.T__2);
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	        this._ctx.stop = this._input.LT(-1);
	        this.state = 229;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,23,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                if(this._parseListeners!==null) {
	                    this.triggerExitRuleEvent();
	                }
	                _prevctx = localctx;
	                this.state = 227;
	                this._errHandler.sync(this);
	                var la_ = this._interp.adaptivePredict(this._input,22,this._ctx);
	                switch(la_) {
	                case 1:
	                    localctx = new CalcExprContext(this, _parentctx, _parentState);
	                    this.pushNewRecursionContext(localctx, _startState, FileDescParser.RULE_calcExpr);
	                    this.state = 221;
	                    if (!( this.precpred(this._ctx, 2))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 2)");
	                    }
	                    this.state = 222;
	                    _la = this._input.LA(1);
	                    if(!(_la===22 || _la===23)) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 223;
	                    this.calcExpr(3);
	                    break;

	                case 2:
	                    localctx = new CalcExprContext(this, _parentctx, _parentState);
	                    this.pushNewRecursionContext(localctx, _startState, FileDescParser.RULE_calcExpr);
	                    this.state = 224;
	                    if (!( this.precpred(this._ctx, 1))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 1)");
	                    }
	                    this.state = 225;
	                    _la = this._input.LA(1);
	                    if(!(_la===24 || _la===25)) {
	                    this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 226;
	                    this.calcExpr(2);
	                    break;

	                } 
	            }
	            this.state = 231;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,23,this._ctx);
	        }

	    } catch( error) {
	        if(error instanceof antlr4.error.RecognitionException) {
		        localctx.exception = error;
		        this._errHandler.reportError(this, error);
		        this._errHandler.recover(this, error);
		    } else {
		    	throw error;
		    }
	    } finally {
	        this.unrollRecursionContexts(_parentctx)
	    }
	    return localctx;
	}



	string() {
	    let localctx = new StringContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 50, FileDescParser.RULE_string);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 232;
	        this.match(FileDescParser.STRING);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	byteData() {
	    let localctx = new ByteDataContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 52, FileDescParser.RULE_byteData);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 234;
	        this.match(FileDescParser.BYTE_VALUE);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	number() {
	    let localctx = new NumberContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 54, FileDescParser.RULE_number);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 236;
	        this.match(FileDescParser.NUMBER);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}


}

FileDescParser.EOF = antlr4.Token.EOF;
FileDescParser.T__0 = 1;
FileDescParser.T__1 = 2;
FileDescParser.T__2 = 3;
FileDescParser.T__3 = 4;
FileDescParser.T__4 = 5;
FileDescParser.T__5 = 6;
FileDescParser.T__6 = 7;
FileDescParser.T__7 = 8;
FileDescParser.T__8 = 9;
FileDescParser.T__9 = 10;
FileDescParser.T__10 = 11;
FileDescParser.BLOCK_COMMENT = 12;
FileDescParser.LINE_COMMENT = 13;
FileDescParser.IF = 14;
FileDescParser.LOOP = 15;
FileDescParser.WHILE = 16;
FileDescParser.FIND = 17;
FileDescParser.BACKFIND = 18;
FileDescParser.BACK = 19;
FileDescParser.NEXT = 20;
FileDescParser.GOTO = 21;
FileDescParser.ASTERISK = 22;
FileDescParser.SLASH = 23;
FileDescParser.PLUS = 24;
FileDescParser.MINUS = 25;
FileDescParser.PART_SPLIT = 26;
FileDescParser.GROUP_TITLE = 27;
FileDescParser.NEWLINE = 28;
FileDescParser.STRING = 29;
FileDescParser.BYTE_VALUE = 30;
FileDescParser.NUMBER = 31;
FileDescParser.VAR = 32;
FileDescParser.WHITESPACE = 33;

FileDescParser.RULE_program = 0;
FileDescParser.RULE_fileData = 1;
FileDescParser.RULE_line = 2;
FileDescParser.RULE_groupLine = 3;
FileDescParser.RULE_fieldLine = 4;
FileDescParser.RULE_commandLine = 5;
FileDescParser.RULE_scopeCommandExpr = 6;
FileDescParser.RULE_whileCommand = 7;
FileDescParser.RULE_ifCommand = 8;
FileDescParser.RULE_loopCommand = 9;
FileDescParser.RULE_findCommand = 10;
FileDescParser.RULE_backCommand = 11;
FileDescParser.RULE_gotoCommand = 12;
FileDescParser.RULE_nextCommand = 13;
FileDescParser.RULE_backFindCommand = 14;
FileDescParser.RULE_multiByteValue = 15;
FileDescParser.RULE_multiMatchDataValue = 16;
FileDescParser.RULE_matchDataExpr = 17;
FileDescParser.RULE_offsetExpr = 18;
FileDescParser.RULE_dataFormatExpr = 19;
FileDescParser.RULE_stringValue = 20;
FileDescParser.RULE_numberValue = 21;
FileDescParser.RULE_byteValue = 22;
FileDescParser.RULE_varExpr = 23;
FileDescParser.RULE_calcExpr = 24;
FileDescParser.RULE_string = 25;
FileDescParser.RULE_byteData = 26;
FileDescParser.RULE_number = 27;

export class ProgramContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_program;
    }

	EOF() {
	    return this.getToken(FileDescParser.EOF, 0);
	};

	NEWLINE = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(FileDescParser.NEWLINE);
	    } else {
	        return this.getToken(FileDescParser.NEWLINE, i);
	    }
	};


	fileData() {
	    return this.getTypedRuleContext(FileDataContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitProgram(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class FileDataContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_fileData;
    }

	line = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(LineContext);
	    } else {
	        return this.getTypedRuleContext(LineContext,i);
	    }
	};

	NEWLINE = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(FileDescParser.NEWLINE);
	    } else {
	        return this.getToken(FileDescParser.NEWLINE, i);
	    }
	};


	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitFileData(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class LineContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_line;
    }

	fieldLine() {
	    return this.getTypedRuleContext(FieldLineContext,0);
	};

	commandLine() {
	    return this.getTypedRuleContext(CommandLineContext,0);
	};

	groupLine() {
	    return this.getTypedRuleContext(GroupLineContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitLine(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class GroupLineContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_groupLine;
    }

	GROUP_TITLE() {
	    return this.getToken(FileDescParser.GROUP_TITLE, 0);
	};

	scopeCommandExpr() {
	    return this.getTypedRuleContext(ScopeCommandExprContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitGroupLine(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class FieldLineContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_fieldLine;
    }

	VAR() {
	    return this.getToken(FileDescParser.VAR, 0);
	};

	PART_SPLIT = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(FileDescParser.PART_SPLIT);
	    } else {
	        return this.getToken(FileDescParser.PART_SPLIT, i);
	    }
	};


	offsetExpr() {
	    return this.getTypedRuleContext(OffsetExprContext,0);
	};

	scopeCommandExpr() {
	    return this.getTypedRuleContext(ScopeCommandExprContext,0);
	};

	dataFormatExpr() {
	    return this.getTypedRuleContext(DataFormatExprContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitFieldLine(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class CommandLineContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_commandLine;
    }

	backCommand() {
	    return this.getTypedRuleContext(BackCommandContext,0);
	};

	nextCommand() {
	    return this.getTypedRuleContext(NextCommandContext,0);
	};

	gotoCommand() {
	    return this.getTypedRuleContext(GotoCommandContext,0);
	};

	findCommand() {
	    return this.getTypedRuleContext(FindCommandContext,0);
	};

	backFindCommand() {
	    return this.getTypedRuleContext(BackFindCommandContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitCommandLine(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class ScopeCommandExprContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_scopeCommandExpr;
    }

	whileCommand() {
	    return this.getTypedRuleContext(WhileCommandContext,0);
	};

	ifCommand() {
	    return this.getTypedRuleContext(IfCommandContext,0);
	};

	loopCommand() {
	    return this.getTypedRuleContext(LoopCommandContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitScopeCommandExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class WhileCommandContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_whileCommand;
    }

	WHILE() {
	    return this.getToken(FileDescParser.WHILE, 0);
	};

	multiByteValue() {
	    return this.getTypedRuleContext(MultiByteValueContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitWhileCommand(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class IfCommandContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_ifCommand;
    }

	IF() {
	    return this.getToken(FileDescParser.IF, 0);
	};

	VAR() {
	    return this.getToken(FileDescParser.VAR, 0);
	};

	multiMatchDataValue() {
	    return this.getTypedRuleContext(MultiMatchDataValueContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitIfCommand(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class LoopCommandContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_loopCommand;
    }

	LOOP() {
	    return this.getToken(FileDescParser.LOOP, 0);
	};

	numberValue() {
	    return this.getTypedRuleContext(NumberValueContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitLoopCommand(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class FindCommandContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_findCommand;
    }

	FIND() {
	    return this.getToken(FileDescParser.FIND, 0);
	};

	multiByteValue() {
	    return this.getTypedRuleContext(MultiByteValueContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitFindCommand(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class BackCommandContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_backCommand;
    }

	BACK() {
	    return this.getToken(FileDescParser.BACK, 0);
	};

	numberValue() {
	    return this.getTypedRuleContext(NumberValueContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitBackCommand(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class GotoCommandContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_gotoCommand;
    }

	GOTO() {
	    return this.getToken(FileDescParser.GOTO, 0);
	};

	numberValue() {
	    return this.getTypedRuleContext(NumberValueContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitGotoCommand(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class NextCommandContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_nextCommand;
    }

	NEXT() {
	    return this.getToken(FileDescParser.NEXT, 0);
	};

	numberValue() {
	    return this.getTypedRuleContext(NumberValueContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitNextCommand(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class BackFindCommandContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_backFindCommand;
    }

	BACKFIND() {
	    return this.getToken(FileDescParser.BACKFIND, 0);
	};

	multiByteValue() {
	    return this.getTypedRuleContext(MultiByteValueContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitBackFindCommand(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class MultiByteValueContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_multiByteValue;
    }

	byteValue = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ByteValueContext);
	    } else {
	        return this.getTypedRuleContext(ByteValueContext,i);
	    }
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitMultiByteValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class MultiMatchDataValueContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_multiMatchDataValue;
    }

	matchDataExpr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(MatchDataExprContext);
	    } else {
	        return this.getTypedRuleContext(MatchDataExprContext,i);
	    }
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitMultiMatchDataValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class MatchDataExprContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_matchDataExpr;
    }

	byteData() {
	    return this.getTypedRuleContext(ByteDataContext,0);
	};

	string() {
	    return this.getTypedRuleContext(StringContext,0);
	};

	number() {
	    return this.getTypedRuleContext(NumberContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitMatchDataExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class OffsetExprContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_offsetExpr;
    }

	numberValue = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(NumberValueContext);
	    } else {
	        return this.getTypedRuleContext(NumberValueContext,i);
	    }
	};

	PART_SPLIT() {
	    return this.getToken(FileDescParser.PART_SPLIT, 0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitOffsetExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class DataFormatExprContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_dataFormatExpr;
    }

	VAR = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(FileDescParser.VAR);
	    } else {
	        return this.getToken(FileDescParser.VAR, i);
	    }
	};


	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitDataFormatExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class StringValueContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_stringValue;
    }

	varExpr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(VarExprContext);
	    } else {
	        return this.getTypedRuleContext(VarExprContext,i);
	    }
	};

	VAR = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(FileDescParser.VAR);
	    } else {
	        return this.getToken(FileDescParser.VAR, i);
	    }
	};


	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitStringValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class NumberValueContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_numberValue;
    }

	varExpr() {
	    return this.getTypedRuleContext(VarExprContext,0);
	};

	number() {
	    return this.getTypedRuleContext(NumberContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitNumberValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class ByteValueContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_byteValue;
    }

	varExpr() {
	    return this.getTypedRuleContext(VarExprContext,0);
	};

	byteData() {
	    return this.getTypedRuleContext(ByteDataContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitByteValue(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class VarExprContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_varExpr;
    }

	calcExpr() {
	    return this.getTypedRuleContext(CalcExprContext,0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitVarExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class CalcExprContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_calcExpr;
    }

	VAR() {
	    return this.getToken(FileDescParser.VAR, 0);
	};

	number() {
	    return this.getTypedRuleContext(NumberContext,0);
	};

	calcExpr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(CalcExprContext);
	    } else {
	        return this.getTypedRuleContext(CalcExprContext,i);
	    }
	};

	ASTERISK() {
	    return this.getToken(FileDescParser.ASTERISK, 0);
	};

	SLASH() {
	    return this.getToken(FileDescParser.SLASH, 0);
	};

	PLUS() {
	    return this.getToken(FileDescParser.PLUS, 0);
	};

	MINUS() {
	    return this.getToken(FileDescParser.MINUS, 0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitCalcExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class StringContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_string;
    }

	STRING() {
	    return this.getToken(FileDescParser.STRING, 0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitString(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class ByteDataContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_byteData;
    }

	BYTE_VALUE() {
	    return this.getToken(FileDescParser.BYTE_VALUE, 0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitByteData(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



export class NumberContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = FileDescParser.RULE_number;
    }

	NUMBER() {
	    return this.getToken(FileDescParser.NUMBER, 0);
	};

	accept(visitor) {
	    if ( visitor instanceof FileDescVisitor ) {
	        return visitor.visitNumber(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}




FileDescParser.ProgramContext = ProgramContext; 
FileDescParser.FileDataContext = FileDataContext; 
FileDescParser.LineContext = LineContext; 
FileDescParser.GroupLineContext = GroupLineContext; 
FileDescParser.FieldLineContext = FieldLineContext; 
FileDescParser.CommandLineContext = CommandLineContext; 
FileDescParser.ScopeCommandExprContext = ScopeCommandExprContext; 
FileDescParser.WhileCommandContext = WhileCommandContext; 
FileDescParser.IfCommandContext = IfCommandContext; 
FileDescParser.LoopCommandContext = LoopCommandContext; 
FileDescParser.FindCommandContext = FindCommandContext; 
FileDescParser.BackCommandContext = BackCommandContext; 
FileDescParser.GotoCommandContext = GotoCommandContext; 
FileDescParser.NextCommandContext = NextCommandContext; 
FileDescParser.BackFindCommandContext = BackFindCommandContext; 
FileDescParser.MultiByteValueContext = MultiByteValueContext; 
FileDescParser.MultiMatchDataValueContext = MultiMatchDataValueContext; 
FileDescParser.MatchDataExprContext = MatchDataExprContext; 
FileDescParser.OffsetExprContext = OffsetExprContext; 
FileDescParser.DataFormatExprContext = DataFormatExprContext; 
FileDescParser.StringValueContext = StringValueContext; 
FileDescParser.NumberValueContext = NumberValueContext; 
FileDescParser.ByteValueContext = ByteValueContext; 
FileDescParser.VarExprContext = VarExprContext; 
FileDescParser.CalcExprContext = CalcExprContext; 
FileDescParser.StringContext = StringContext; 
FileDescParser.ByteDataContext = ByteDataContext; 
FileDescParser.NumberContext = NumberContext; 
