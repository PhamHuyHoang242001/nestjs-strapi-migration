import { EventName, TopicName } from '@common/consumer';
import { KafkaAdapter } from '@common/infrastructure/kafka.adapter';
import { DATA_SELF_SERVE_EVENTS } from './data-self-serve.events';
import { DataSelfServeListener } from './data-self-serve.listener';

jest.mock('@common/infrastructure/kafka.adapter', () => ({
  KafkaAdapter: { publish: jest.fn() },
}));

describe('DataSelfServeListener', () => {
  const listener = new DataSelfServeListener();

  beforeEach(() => jest.clearAllMocks());

  it('publishes validate-file-input event with Strapi-compatible EventData', async () => {
    await listener.executeValidateFileInput({ user: { id: 7 }, requestId: 11, fileUrl: 's3/input.xlsx' });

    expect(KafkaAdapter.publish).toHaveBeenCalledTimes(1);
    const eventData = (KafkaAdapter.publish as jest.Mock).mock.calls[0][0];
    expect(eventData.topic).toBe(TopicName.DATA_VALIDATOR);
    expect(eventData.event).toBe(EventName.EXECUTE_VALIDATE_FILE_INPUT_DATA_SELF_SERVE);
    expect(eventData.transform().di_obj).toMatchObject({ id: '11', data: { requestId: 11 } });
  });

  it('keeps internal event names centralized', () => {
    expect(DATA_SELF_SERVE_EVENTS.PUSH_PAYLOAD_TO_DPC).toBe('data-self-serve.push-payload-to-dpc');
  });
});
