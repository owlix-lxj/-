import { MiaosheChatWorkspaceClient } from '@/components/miaoshe-chat/workspace-client';

export default async function MiaosheChatPage() {
  return (
    <div className="-m-6 h-[calc(100%+3rem)] overflow-hidden">
      <MiaosheChatWorkspaceClient />
    </div>
  );
}
