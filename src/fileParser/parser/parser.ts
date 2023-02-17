import antlr4 from 'antlr4';

import { FileData } from './FileData';
import FileDescLexer from './grammar/FileDescLexer';
import FileDescVisitor from './grammar/FileDescVisitor';
import FileDescParser from './grammar/FileDescParser';

export async function parse(fileFormat: string, file?: File) {
    console.time('tokenize');
    const chars = new antlr4.InputStream(fileFormat);
    const lexer = new FileDescLexer(chars);
    const tokens = new antlr4.CommonTokenStream(lexer);
    console.timeEnd('tokenize');

    console.time('parse');
    const parser = new FileDescParser(tokens);
    // parser.buildParseTrees = true;

    const tree = parser.program();
    console.timeEnd('parse');

    console.time('emit');
    const data = new FileData();
    data.setFile(file);

    tree.accept(new FileDescVisitor(data));

    await data.ready;
    console.timeEnd('emit');

    return data;
}
