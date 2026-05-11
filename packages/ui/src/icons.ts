import * as Hugeicons from '@hugeicons/core-free-icons';
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  CodeIcon,
  DashboardSpeed01Icon,
  DashboardSquare01Icon,
  DatabaseIcon,
  Delete02Icon,
  File01Icon,
  Heading02Icon,
  Heading03Icon,
  HighlighterIcon,
  Home01Icon,
  Image01Icon,
  ImageUploadIcon,
  LaptopIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  LineIcon,
  Link01Icon,
  Loading03Icon,
  Login03Icon,
  Logout03Icon,
  Menu01Icon,
  Moon02Icon,
  MoreVerticalIcon,
  PackageIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  QuoteDownIcon,
  Redo02Icon,
  RefreshIcon,
  RotateClockwiseIcon,
  SaveEnergy01Icon,
  Search01Icon,
  Settings02Icon,
  Sun01Icon,
  Table01Icon,
  TextAlignCenterIcon,
  TextAlignJustifyCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextSubscriptIcon,
  TextSuperscriptIcon,
  TextUnderlineIcon,
  Tick02Icon,
  Undo02Icon,
  Upload03Icon,
  User02Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from './components/icon';

/**
 * Единая точка импорта иконок для Studio.
 *
 * Сохраняем знакомые имена (`Plus`, `ArrowRight`, `Loader2` и т.д.),
 * но под капотом используем Hugeicons.
 */
export const AlertTriangle = AlertCircleIcon;
export const RefreshCw = RefreshIcon;
export const Plus = PlusSignIcon;
export const ChevronLeft = ArrowLeft01Icon;
export const ChevronRight = ArrowRight01Icon;
export const Pencil = PencilEdit02Icon;
export const Trash = Delete02Icon;
export const Trash2 = Delete02Icon;
export const ArrowLeft = ArrowLeft01Icon;
export const ArrowRight = ArrowRight01Icon;
export const Loader2 = Loading03Icon;
export const Save = SaveEnergy01Icon;
export const LogIn = Login03Icon;
export const LogOut = Logout03Icon;
export const FileText = File01Icon;
export const Home = Home01Icon;
export const System = LaptopIcon;
export const Sun = Sun01Icon;
export const Moon = Moon02Icon;
export const LayoutDashboard = DashboardSquare01Icon;
/** Дашборд-обзор Studio (главная страница). Спидометр-вариация, отличающаяся от LayoutDashboard. */
export const Gauge = DashboardSpeed01Icon;
/** Иконка навигации / мегаменю в сайдбаре Studio. */
export const NavMenu = Menu01Icon;
export const User = User02Icon;
export const Boxes = PackageIcon;
export const CheckCircle2 = CheckmarkCircle02Icon;
export const MoreVertical = MoreVerticalIcon;
export const RotateCcw = RotateClockwiseIcon;
export const Database = DatabaseIcon;
export const Settings = Settings02Icon;
export const Check = Tick02Icon;
export const ChevronDown = ArrowDown01Icon;
export const ChevronUp = ArrowUp01Icon;

// Иконки медиа-фичи (Phase 13).
export const ImageIcon = Image01Icon;
export const UploadCloud = ImageUploadIcon;
export const Upload = Upload03Icon;
export const Search = Search01Icon;
export const Close = Cancel01Icon;

// Иконки тулбара rich-text-редактора (Phase 12).
export const Bold = TextBoldIcon;
export const Italic = TextItalicIcon;
export const Underline = TextUnderlineIcon;
export const Strikethrough = TextStrikethroughIcon;
export const Code = CodeIcon;
export const Highlighter = HighlighterIcon;
export const Link = Link01Icon;
export const Heading2 = Heading02Icon;
export const Heading3 = Heading03Icon;
export const List = LeftToRightListBulletIcon;
export const ListOrdered = LeftToRightListNumberIcon;
export const ListChecks = CheckListIcon;
export const Quote = QuoteDownIcon;
export const Minus = LineIcon;
export const Undo2 = Undo02Icon;
export const Redo2 = Redo02Icon;
export const AlignLeft = TextAlignLeftIcon;
export const AlignCenter = TextAlignCenterIcon;
export const AlignRight = TextAlignRightIcon;
export const AlignJustify = TextAlignJustifyCenterIcon;
export const Subscript = TextSubscriptIcon;
export const Superscript = TextSuperscriptIcon;
export const Table = Table01Icon;

/**
 * Возвращает иконку по имени (`Home01Icon`, `File01Icon` и т.д.).
 * Если имя не найдено, возвращает `undefined`.
 */
export function getIconByName(name: string | null | undefined): IconSvgElement | undefined {
  if (!name) return undefined;
  const candidate = (Hugeicons as Record<string, unknown>)[name];
  if (!Array.isArray(candidate)) return undefined;
  return candidate as IconSvgElement;
}
