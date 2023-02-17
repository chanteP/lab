// Generated from java-escape by ANTLR 4.11.1
// jshint ignore: start
import antlr4 from 'antlr4';

import {
    DataOrder,
    defaultDataOrder,
    type FieldRecord,
    type FieldValue,
    type FileData,
    type GroupRecord,
} from '../FileData';
import { SyntaxException } from '../exception';
import {
    ProgramContext,
    FileDataContext,
    LineContext,
    GroupLineContext,
    FieldLineContext,
    CommandLineContext,
    ScopeCommandExprContext,
    WhileCommandContext,
    FindCommandContext,
    BackFindCommandContext,
    IfCommandContext,
    LoopCommandContext,
    BackCommandContext,
    GotoCommandContext,
    NextCommandContext,
    MultiByteValueContext,
    MultiMatchDataValueContext,
    MatchDataExprContext,
    OffsetExprContext,
    DataFormatExprContext,
    NumberValueContext,
    ByteValueContext,
    VarExprContext,
    StringValueContext,
    CalcExprContext,
} from './FileDescParser';
import { inMultiMatchDataValue, isMultiByteValueWithOffset, isOddFilter } from '../utils';

// This class defines a complete generic visitor for a parse tree produced by FileDescParser.

type OffsetLengthPatternResult = {
    shouldMove: true;
    order: DataOrder;
    offset: number | string;
    length: number | string;
};
type OffsetEndPatternResult = {
    shouldMove: false;
    order: DataOrder;
    offset: number | string;
    end: number | string;
};
type OffsetPatternResult = OffsetLengthPatternResult | OffsetEndPatternResult;

type ScopeContext = GroupLineContext | FileDataContext;
type ChildContext = GroupLineContext | FieldLineContext | CommandLineContext;

interface ScopeInfo {
    level: number;
    context: ScopeContext;
    children: ChildContext[];
}

enum ParseAction {
    PARSE = 0,
    COLLECT = 1,
}

type ScopeCommandFunction<T> = () => Promise<T>;

export default class FileDescVisitor extends antlr4.tree.ParseTreeVisitor {
    private file: FileData;

    private cacheScopeContext: WeakMap<ScopeContext, ChildContext[]> = new WeakMap();
    private scopeStack: ScopeInfo[] = [];
    private get currentScope() {
        return this.scopeStack[this.scopeStack.length - 1]!;
    }

    // 用来判断当前是收集scope还是解析line
    private parseStatus: ParseAction = ParseAction.COLLECT;
    private get isCollecting() {
        return this.parseStatus === ParseAction.COLLECT;
    }

    constructor(fileData: FileData) {
        super();
        this.file = fileData;
    }

    private log(...args: any[]) {
        console.log('[FileDesc]', ...args);
    }

    // scope ----------------------------------------------------------------
    private addScope(scopeContext: ScopeContext, level: number) {
        const cacheScopeContext = this.cacheScopeContext;
        if (cacheScopeContext.has(scopeContext)) {
            console.warn('group scope exists');
            return;
        }
        cacheScopeContext.set(scopeContext, []);

        while (this.currentScope) {
            if (level <= this.currentScope.level) {
                this.scopeStack.pop();
            } else {
                break;
            }
        }

        if (this.currentScope && this.isCollecting) {
            this.pushChildContext(scopeContext as GroupLineContext);
        }

        this.scopeStack.push({
            level,
            context: scopeContext,
            get children() {
                return cacheScopeContext.get(scopeContext)!;
            },
        });
    }

    private pushChildContext(ctx: ChildContext) {
        if (!this.isCollecting) {
            return;
        }
        console.warn(ctx.getText(), this.currentScope.context);
        this.cacheScopeContext.get(this.currentScope.context)!.push(ctx);
    }

    private async visitCollectContextChildren(ctx: ScopeContext) {
        const children = this.cacheScopeContext.get(ctx) ?? [];

        let i = 0;
        while (i < children.length) {
            const child = children[i]!;
            i++;

            this.log('exec: ', child.getText());
            if (child instanceof GroupLineContext) {
                await this.visitGroupLine(child);
            } else if (child instanceof FieldLineContext) {
                await this.visitFieldLine(child);
            } else if (child instanceof CommandLineContext) {
                await this.visitCommandLine(child);
            } else {
                console.error('unexpected line', child);
                // await this.visit(child);
            }
        }
    }

    private drawScope(ctx?: ScopeContext, tab = '|---') {
        if (!ctx) {
            ctx = this.scopeStack[0]!.context;
        }
        const nextTab = tab + '|---';

        this.cacheScopeContext.get(ctx)?.forEach((child) => {
            this.log(tab, child.getText());
            this.drawScope(child as ScopeContext, nextTab);
        });
    }

    // ----------------------------------------------------------------

    // Visit a parse tree produced by FileDescParser#file.
    visitProgram(ctx: ProgramContext) {
        this.visitChildren(ctx);
    }

    // Visit a parse tree produced by FileDescParser#fileData.
    async visitFileData(ctx: FileDataContext) {
        this.parseStatus = ParseAction.COLLECT;
        this.addScope(ctx, 0);
        this.visitChildren(ctx);

        this.drawScope();

        if (this.scopeStack.length > 1 && !this.scopeStack[0]?.children.includes(this.scopeStack[1]?.context!)) {
            console.error('parse error!!! scope collect failed!!!');
        }

        this.scopeStack = [];
        this.log('scope------', this.scopeStack);

        this.parseStatus = ParseAction.PARSE;
        await this.visitCollectContextChildren(ctx);

        this.file.ready.resolve();
    }
    // line ----------------------------------------------------------------

    // Visit a parse tree produced by FileDescParser#line.
    visitLine(ctx: LineContext) {
        return this.visitChildren(ctx);
    }

    // Visit a parse tree produced by FileDescParser#groupLine.
    async visitGroupLine(ctx: GroupLineContext) {
        const protoChildren = ctx.children;
        const children =
            protoChildren[0] instanceof ScopeCommandExprContext ? [...protoChildren] : [undefined, ...protoChildren];
        const [command, nameData] = children;

        const [match, mark, name] = /(#+)(.*)/.exec(nameData.getText()) ?? [];

        const level = mark!.length;

        if (this.isCollecting) {
            this.addScope(ctx, level);
            return;
        }

        const parseGroupData: ScopeCommandFunction<GroupRecord> = async () => {
            const groupData: GroupRecord = {
                type: 'group',
                level,
                name: name ?? '',
                content: [],
            };
            // 得先push再操作command。command依赖group栈处理
            this.file.push(groupData);
            this.log('group---', ctx.getText(), groupData);

            await this.visitCollectContextChildren(ctx);
            return groupData;
        };

        if (command) {
            await this.visitScopeCommandExpr(command, parseGroupData);
        } else {
            await parseGroupData();
        }
    }

    // Visit a parse tree produced by FileDescParser#fieldLine.
    async visitFieldLine(ctx: FieldLineContext) {
        if (this.isCollecting) {
            this.pushChildContext(ctx);
            return;
        }

        const protoChildren = ctx.children;
        const children =
            protoChildren[0] instanceof ScopeCommandExprContext ? [...protoChildren] : [undefined, ...protoChildren];
        const [command, ...restData] = children;

        const fieldNodeData = this.visit(restData);

        const [name, s1, offsetPatternData, s2, formatter = []] = fieldNodeData;

        const offsetPattern: OffsetPatternResult = offsetPatternData;
        const { shouldMove, order, offset } = offsetPattern;

        const parseFieldData: ScopeCommandFunction<FieldRecord> = async () => {
            const fieldData: FieldRecord = {
                type: 'field',
                name,
                offset,
                order,
                shouldMove,
                data: null,
                value: undefined,
                length,
                formatter,
            };

            if ('length' in offsetPattern) {
                fieldData.length = offsetPattern.length;
                fieldData.offset = this.file.pointer;

                fieldData.data = await this.file.getData(
                    fieldData.offset,
                    fieldData.offset + Number(fieldData.length),
                    fieldData.order,
                );
                this.file.move(Number(fieldData.length));
            } else {
                fieldData.offset = offset;
                fieldData.end = offsetPattern.end;

                fieldData.data = await this.file.getData(
                    Number(fieldData.offset),
                    Number(fieldData.end),
                    fieldData.order,
                );
            }

            const value = this.file.pipeDataFormatter(fieldData, formatter);
            fieldData.value = value;

            this.file.push(fieldData);

            this.log('field---', ctx.getText(), fieldData);
            return fieldData;
        };

        if (command) {
            await this.visitScopeCommandExpr(command, parseFieldData);
        } else {
            await parseFieldData();
        }
    }

    // Visit a parse tree produced by FileDescParser#commandLine.
    async visitCommandLine(ctx: CommandLineContext) {
        if (this.isCollecting) {
            this.pushChildContext(ctx);
            return;
        }
        const childCommand = ctx.children[0];

        switch (true) {
            case childCommand instanceof FindCommandContext:
                return this.visitFindCommand(childCommand);
            case childCommand instanceof BackCommandContext:
                return this.visitBackCommand(childCommand);
            case childCommand instanceof GotoCommandContext:
                return this.visitGotoCommand(childCommand);
            case childCommand instanceof NextCommandContext:
                return this.visitNextCommand(childCommand);
            case childCommand instanceof BackFindCommandContext:
                return this.visitBackFindCommand(childCommand);
            default:
                console.error(`invalid command: ${childCommand.getText()}`);
                return;
        }
    }

    // command ----------------------------------------------------------------

    // Visit a parse tree produced by FileDescParser#groupCommandExpr.
    async visitScopeCommandExpr(
        ctx: ScopeCommandExprContext,
        execRecord: ScopeCommandFunction<GroupRecord | FieldRecord>,
    ) {
        const commandContext = ctx.children?.[0];
        switch (true) {
            case commandContext instanceof WhileCommandContext:
                await this.visitWhileCommand(commandContext, execRecord);
                break;
            case commandContext instanceof IfCommandContext:
                await this.visitIfCommand(commandContext, execRecord);
                break;
            case commandContext instanceof LoopCommandContext:
                await this.visitLoopCommand(commandContext, execRecord);
                break;
        }
    }

    // Visit a parse tree produced by FileDescParser#whileCommand.
    async visitWhileCommand(ctx: WhileCommandContext, execRecord: ScopeCommandFunction<GroupRecord | FieldRecord>) {
        let once = 1;
        let maxLoopLimit = this.file.maxLoopLimit;

        const condition = async () => {
            if (!this.file.hasFile()) {
                return once--;
            }
            maxLoopLimit--;
            if (maxLoopLimit <= 0) {
                console.warn(`<while> reach max loop limit:${this.file.maxLoopLimit}`);
                return false;
            }
            const [whileMark, lb, expectValue, rb] = this.visitChildren(ctx);

            const fileData = await this.file.getFileData();
            return isMultiByteValueWithOffset(fileData!, this.file.pointer, expectValue) !== false;
        };

        while (await condition()) {
            const group = await execRecord();
            group.loop = true;
            group.optional = true;
        }
    }

    // Visit a parse tree produced by FileDescParser#ifCommand.
    async visitIfCommand(ctx: IfCommandContext, execRecord: ScopeCommandFunction<GroupRecord | FieldRecord>) {
        const condition = () => {
            if (!this.file.hasFile()) {
                return true;
            }
            const [ifMark, lb, varValue, isMark, expectValue, rb] = this.visitChildren(ctx);
            const data = this.file.getVar(varValue);
            return inMultiMatchDataValue(data, expectValue);
        };

        if (condition()) {
            const group = await execRecord();
            group.optional = true;
        }
    }

    // Visit a parse tree produced by FileDescParser#loopCommand.
    async visitLoopCommand(ctx: LoopCommandContext, execRecord: ScopeCommandFunction<GroupRecord | FieldRecord>) {
        const [loopMark, lb, loopValue, rb] = this.visitChildren(ctx);
        let loopCount = 1;

        if (this.file.hasFile()) {
            if (!rb) {
                // loop()
                loopCount = this.file.maxLoopLimit;
            } else {
                // loop(value)
                loopCount = +loopValue || 0;
            }
        }

        if (loopCount > this.file.maxLoopLimit) {
            console.warn(`<while> reach max loop limit:${this.file.maxLoopLimit}`);
        }
        loopCount = Math.min(this.file.maxLoopLimit, loopCount);
        while (loopCount-- > 0) {
            if (this.file.isEnd()) {
                break;
            }
            const group = await execRecord();
            group.loop = true;
        }
    }

    // ----------------

    // Visit a parse tree produced by FileDescParser#findCommand.
    async visitFindCommand(ctx: FindCommandContext) {
        const [name, lb, multiByteValue, rb] = this.visitChildren(ctx);
        this.file.push({
            type: 'command',
            name,
            args: multiByteValue,
        });

        if (!this.file.hasFile()) {
            return;
        }
        const fileData = await this.file.getFileData();
        const target = isMultiByteValueWithOffset(fileData!, this.file.pointer, multiByteValue);
        if (target === false) {
            this.file.moveTo(this.file.size);
            return;
        }
        this.file.moveTo(target);
    }

    // Visit a parse tree produced by FileDescParser#backFindCommand.
    async visitBackFindCommand(ctx: BackFindCommandContext) {
        const [name, lb, multiByteValue, rb] = this.visitChildren(ctx);
        this.file.push({
            type: 'command',
            name,
            args: multiByteValue,
        });

        if (!this.file.hasFile()) {
            return;
        }
        const fileData = await this.file.getFileData();
        const target = isMultiByteValueWithOffset(fileData!, this.file.pointer, multiByteValue, -1);
        if (target === false) {
            this.file.moveTo(0);
            return;
        }
        this.file.moveTo(target);
    }
    // Visit a parse tree produced by FileDescParser#backCommand.
    async visitBackCommand(ctx: BackCommandContext) {
        const [name, lb, numberValue, rb] = this.visitChildren(ctx);
        this.file.push({
            type: 'command',
            name,
            args: [numberValue],
        });

        if (!this.file.hasFile()) {
            return;
        }
        this.file.move(-numberValue);
    }

    // Visit a parse tree produced by FileDescParser#gotoCommand.
    async visitGotoCommand(ctx: GotoCommandContext) {
        const [name, lb, numberValue, rb] = this.visitChildren(ctx);
        this.file.push({
            type: 'command',
            name,
            args: [numberValue],
        });

        if (!this.file.hasFile()) {
            return;
        }
        this.file.moveTo(numberValue);
    }

    // Visit a parse tree produced by FileDescParser#nextCommand.
    async visitNextCommand(ctx: NextCommandContext) {
        const [name, lb, numberValue, rb] = this.visitChildren(ctx);
        this.file.push({
            type: 'command',
            name,
            args: [numberValue],
        });

        if (!this.file.hasFile()) {
            return;
        }
        this.file.move(numberValue);
    }

    // value expression ----------------------------------------------------------------

    // Visit a parse tree produced by FileDescParser#multiByteValue.
    visitMultiByteValue(ctx: MultiByteValueContext) {
        return this.visitChildren(ctx).filter(isOddFilter);
    }

    // Visit a parse tree produced by FileDescParser#multiMatchDataValue.
    visitMultiMatchDataValue(ctx: MultiMatchDataValueContext) {
        return this.visitChildren(ctx).filter(isOddFilter);
    }

    // Visit a parse tree produced by FileDescParser#matchDataExpr.
    visitMatchDataExpr(ctx: MatchDataExprContext) {
        return this.visitChildren(ctx)[0];
    }

    // Visit a parse tree produced by FileDescParser#offsetExpr.
    visitOffsetExpr(ctx: OffsetExprContext): OffsetPatternResult {
        // const { shouldMove, order, offset, length, end };
        const data = this.visitChildren(ctx);
        let order = defaultDataOrder;
        let shouldMove = true;
        let offset = this.file.pointer;
        let end = 0;
        let length = 0;

        if (data[0] === '>') {
            order = DataOrder.BE;
            data.shift();
        } else if (data[0] === '<') {
            order = DataOrder.LE;
            data.shift();
        }

        if (data[0] === '[') {
            shouldMove = false;
            offset = data[1];
            end = data[3];
            return { shouldMove, order, offset, end };
        }
        length = data[0] || 0;
        return { shouldMove, order, offset, length };
    }

    // Visit a parse tree produced by FileDescParser#dataFormatExpr.
    visitDataFormatExpr(ctx: DataFormatExprContext) {
        return this.visitChildren(ctx).filter(isOddFilter);
    }

    // basic value ----------------------------------------------------------------

    override visitTerminal(ctx) {
        return ctx.getText();
    }

    // Visit a parse tree produced by FileDescParser#numberValue.
    visitNumberValue(ctx: NumberValueContext) {
        return this.visitChildren(ctx)[0];
    }

    // Visit a parse tree produced by FileDescParser#byteValue.
    visitByteValue(ctx: ByteValueContext) {
        return this.visitChildren(ctx)[0];
    }

    // Visit a parse tree produced by FileDescParser#varExpr.
    visitVarExpr(ctx: VarExprContext) {
        return this.visitChildren(ctx)[1];
    }

    // Visit a parse tree produced by FileDescParser#textValue.
    // visitTextValue(ctx: TextValueContext) {
    //     return this.visitChildren(ctx).join(' ');
    // }

    // Visit a parse tree produced by FileDescParser#stringValue.
    visitStringValue(ctx: StringValueContext) {
        return this.visitChildren(ctx).join(' ');
    }

    visitByteData(ctx): Uint8Array {
        const value = ctx.children[0]
            .getText()
            .slice(1, -1)
            .split(' ')
            .filter((s: string) => !!s)
            .map((s) => {
                return parseInt(s, 16);
            });
        return new Uint8Array(value);
    }

    visitNumber(ctx): number {
        return +this.visitChildren(ctx)[0];
    }

    visitString(ctx): string {
        return this.visitChildren(ctx)[0].slice(1, -1);
    }

    // Visit a parse tree produced by FileDescParser#calcExpr.
    visitCalcExpr(ctx: CalcExprContext): FieldValue {
        if (ctx.children.length === 1) {
            const data = ctx.children[0].getText();
            if (isNaN(data)) {
                return this.file.getVar(data);
            }
            return data;
        }
        const rs = this.visitChildren(ctx);
        if (rs[0] === '(') {
            return rs[1];
        }
        const [l, o, r] = rs;
        switch (o) {
            case '*':
                return +l * +r;
            case '/':
                return +l / +r;
            case '+':
                return +l + +r;
            case '-':
                return +l - +r;
        }
        throw new SyntaxException(`unknown operation ${o}`);
    }
}
