import { currentLocale } from "./chat-view/locale";
import { translate, type TranslationValues } from "../shared/i18n";
export { useLocale } from "./chat-view/locale";
export function tr(source: string, values?: TranslationValues) {
  return translate(currentLocale(), source, values);
}
