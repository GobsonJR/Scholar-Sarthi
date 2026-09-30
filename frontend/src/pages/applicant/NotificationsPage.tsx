import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../../services/notifications";
import { NotificationItem } from "../../components/domain/NotificationItem";
import { LoadingState, EmptyState } from "../../components/ui/States";
import { Button } from "../../components/ui/Button";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: notifications, isLoading } = useQuery({ queryKey: ["notifications"], queryFn: listNotifications });

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (isLoading) return <LoadingState label="Loading notifications..." />;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Notifications</h1>
        <Button variant="outline" size="sm" onClick={() => readAllMutation.mutate()}>
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </div>

      {!notifications || notifications.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up." description="You'll be notified here about status changes, correction requests and decisions." />
      ) : (
        <div className="card divide-y divide-border p-0">
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onClick={() => {
                if (!n.is_read) readMutation.mutate(n.id);
                if (n.application_id) navigate(`/app/applications/${n.application_id}`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
