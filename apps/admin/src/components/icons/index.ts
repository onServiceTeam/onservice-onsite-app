/**
 * Centralized icon module for the admin panel.
 *
 * All icons MUST be imported FROM this file, never directly from `lucide-react`.
 * This indirection lets us swap libraries, normalize naming, and enforce the
 * design-system catalog (see docs/design-system/icon-catalog.md).
 *
 * To add a new icon:
 *   1. Re-export it below (raw lucide name + optional semantic alias).
 *   2. Document semantic intent in docs/design-system/icon-catalog.md.
 *   3. Run `bash .ai-coder/checkpoints/verify-no-emoji.sh` after wiring usages.
 */

export {
  // Navigation
  LayoutDashboard,
  Users,
  Wrench,
  ClipboardList,
  Package,
  TrendingUp,
  Scale,
  Coins,
  Banknote,
  Megaphone,
  Repeat,
  Building2,
  MapPin,
  LineChart,
  Search,
  Ticket,
  Settings,

  // Service categories
  Sparkles,
  Zap,
  ShowerHead,
  Paintbrush2,
  Home,
  Hammer,

  // Status & alerts
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  X,
  XCircle,
  Info,
  Clock,
  Calendar,

  // Profile & users
  User,
  UserCheck,
  UserX,
  UserPlus,
  Shield,
  Lock,

  // Files & docs
  Folder,
  FileText,
  Image as ImageIcon,
  Download,
  Upload,
  Eye,
  EyeOff,

  // Charts (for dashboard)
  BarChart,
  BarChart3,
  PieChart,
  Activity,
  TrendingDown,

  // Actions
  Plus,
  Minus,
  Pencil,
  Trash2,
  Save,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  MoreVertical,
  Filter,
  ArrowUpAZ as SortAsc,
  ArrowDownAZ as SortDesc,
  ExternalLink,
  Copy,

  // Communication
  Phone,
  Mail,
  MessageSquare,
  Bell,
  BellOff,

  // Misc
  Rocket,
  Star,
  Heart,
  Flag,
  Tag,
  Tags,
  Globe,
  Map,
  Navigation,
  Truck,
  CreditCard,
  Receipt,
  Wallet,
  HelpCircle,
  Key,
  History,
  RotateCcw,
  DollarSign,
} from 'lucide-react';
