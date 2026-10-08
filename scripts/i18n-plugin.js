// Translate presentation values at compile time; never alter form values,
// domain identifiers, React state, persisted records or DOM nodes.
export default function localizationPlugin({ types: t }) {
  const call = (name, node) => t.callExpression(t.identifier(name), [node]);
  return {
    visitor: {
      JSXElement(path, state) {
        if (!state.localize || path.node.openingElement.name.name !== 'option') return;
        const attributes = path.node.openingElement.attributes;
        if (attributes.some(attribute => attribute.name?.name === 'value')) return;
        const children = path.node.children.filter(child => !t.isJSXText(child) || child.value.trim());
        if (children.length === 1) {
          const value = t.isJSXText(children[0]) ? t.stringLiteral(children[0].value.trim())
            : t.isJSXExpressionContainer(children[0]) ? t.cloneNode(children[0].expression, true) : null;
          if (value) attributes.push(t.jsxAttribute(t.jsxIdentifier('value'), t.jsxExpressionContainer(value)));
        }
      },
      Program: {
        enter(path, state) {
          state.localize = /[/\\]web[/\\].*\.jsx$/.test(state.filename || '');
          if (state.localize) path.unshiftContainer('body', t.importDeclaration([
            t.importSpecifier(t.identifier('__t'), t.identifier('translateText')),
            t.importSpecifier(t.identifier('__l'), t.identifier('translateNode')),
          ], t.stringLiteral('./i18n.js')));
        },
      },
      JSXText(path, state) {
        if (!state.localize) return;
        const text = path.node.value.split(/\r?\n/).map((line, i, lines) =>
          i === 0 ? line.trimEnd() : i === lines.length - 1 ? line.trimStart() : line.trim()
        ).filter(Boolean).join(' ');
        if (text.trim()) { path.replaceWith(t.jsxExpressionContainer(call('__t', t.stringLiteral(text)))); path.skip(); }
      },
      JSXExpressionContainer(path, state) {
        if (!state.localize || t.isJSXEmptyExpression(path.node.expression)) return;
        const expression = path.node.expression;
        if (t.isCallExpression(expression) && ['__t', '__l'].includes(expression.callee.name)) return;
        if (t.isJSXAttribute(path.parent)) {
          if (['label', 'title', 'text', 'subtitle', 'hint', 'placeholder', 'aria-label'].includes(path.parent.name.name))
            path.node.expression = call('__t', expression);
        } else path.node.expression = call('__l', expression);
      },
      JSXAttribute(path, state) {
        if (state.localize && t.isStringLiteral(path.node.value) &&
          ['label', 'title', 'text', 'subtitle', 'hint', 'placeholder', 'aria-label'].includes(path.node.name.name))
          path.node.value = t.jsxExpressionContainer(call('__t', path.node.value));
      },
    },
  };
}
