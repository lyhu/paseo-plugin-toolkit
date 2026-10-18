import { currentLocale } from "./chat-view/locale";
import { renderMessage, type LocalizedMessage } from "../shared/chat-view/i18n";
import { translate, type TranslationValues } from "../shared/i18n";
export { useLocale } from "./chat-view/locale";
export function tr(source: string | LocalizedMessage, values?: TranslationValues) {
  return typeof source === "string"
    ? translate(currentLocale(), source, values)
    : renderMessage(currentLocale(), source);
}
