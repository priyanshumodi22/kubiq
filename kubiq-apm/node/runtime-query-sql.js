function quoteEnd(statement, index) {
    const quote = statement[index++];
    while (index < statement.length) {
        if (statement[index] === '\\') { index += 2; continue; }
        if (statement[index] !== quote) { index++; continue; }
        if (statement[index + 1] === quote) { index += 2; continue; }
        return index + 1;
    }
    return -1;
}
function part(statement, index) {
    const char = statement[index], next = statement[index + 1];
    if ((char === '-' && next === '-') || char === '#') {
        const end = statement.indexOf('\n', index);
        return { next: end === -1 ? statement.length : end, text: ' ' };
    }
    if (char === '/' && next === '*') {
        const end = statement.indexOf('*/', index + 2);
        return end === -1 ? null : { next: end + 2, text: ' ' };
    }
    if (!["'", '"', '`'].includes(char)) return { next: index + 1, text: char };
    const end = quoteEnd(statement, index);
    return end === -1 ? null : { next: end, text: statement.slice(index, end) };
}
function sqlStatement(statement, mask) {
    if (statement.length > 16384) return '[QUERY EXCEEDS CAPTURE LIMIT]';
    if (mask) return '[REDACTED: CREDENTIAL-RELATED STATEMENT]';
    let output = '';
    for (let index = 0; index < statement.length;) {
        const token = part(statement, index);
        if (!token) return '[QUERY UNAVAILABLE]';
        output += token.text;
        index = token.next;
    }
    return output;
}
module.exports = { sqlStatement };
