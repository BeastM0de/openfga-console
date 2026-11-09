import { StreamLanguage } from "@codemirror/language";

export const openfgaDslLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/\/\/.*$/)) return "comment";
    if (stream.match(/\b(model|schema|type|relations|define|condition|with|from)\b/)) return "keyword";
    if (stream.match(/\b(or|and|but|not)\b/)) return "operator";
    if (stream.match(/\[[^\]]+\]/)) return "typeName";
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";
    if (stream.match(/[A-Za-z_][\w-]*/)) return "variableName";
    stream.next();
    return null;
  },
});
