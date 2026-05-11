import { Button, Icon } from '@minecms/ui';
import { LayoutDashboard, LogIn, LogOut } from '@minecms/ui/icons';
import { useNavigate } from '@tanstack/react-router';
import { trpc } from '../../shared/api/client';

/**
 * Верхняя панель: пустой слот для будущих действий слева и блок пользователя справа.
 *
 * Logout-мутация инвалидирует серверную сессию и стирает cookie. После успеха
 * прыгаем на /login — гард пропустит, потому что `installation_state = installed`
 * сохраняется независимо от сессии.
 */
export function Topbar(): React.JSX.Element {
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
    },
  });
  const navigate = useNavigate();
  const user = me.data?.user ?? null;

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon icon={LayoutDashboard} className="size-4" aria-hidden="true" />
        <span>Studio</span>
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                logout.mutate(undefined, {
                  onSuccess: () => navigate({ to: '/login' }),
                });
              }}
              disabled={logout.isPending}
            >
              <Icon icon={LogOut} /> Выйти
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => navigate({ to: '/login' })}>
            <Icon icon={LogIn} /> Войти
          </Button>
        )}
      </div>
    </header>
  );
}
