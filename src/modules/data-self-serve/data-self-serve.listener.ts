import { EventKey, EventName, TopicName } from '@common/consumer';
import { EventData, EventObjectType } from '@common/event-source';
import { KafkaAdapter } from '@common/infrastructure/kafka.adapter';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as dayjs from 'dayjs';
import { DATA_SELF_SERVE_EVENTS, DataSelfServeEventPayload } from './data-self-serve.events';

@Injectable()
export class DataSelfServeListener {
  @OnEvent(DATA_SELF_SERVE_EVENTS.VALIDATE_FILE_INPUT)
  async executeValidateFileInput(data: DataSelfServeEventPayload) {
    const eventData = new EventData({
      id: `${data.requestId}`,
      topic: TopicName.DATA_VALIDATOR,
      event: EventName.EXECUTE_VALIDATE_FILE_INPUT_DATA_SELF_SERVE,
      key: EventKey.EXECUTE_VALIDATE_FILE_INPUT_DATA_SELF_SERVE,
      pr_obj: { id: `${data.user.id}`, type: EventObjectType.USER, data: data.user },
      di_obj: { id: `${data.requestId}`, type: EventObjectType.DATA_SELF_SERVE, data },
    });
    await KafkaAdapter.publish(eventData);
  }

  @OnEvent(DATA_SELF_SERVE_EVENTS.PUSH_PAYLOAD_TO_DPC)
  async pushPayloadToDpc(data: DataSelfServeEventPayload) {
    const eventData = new EventData({
      id: `${data.requestId}`,
      topic: TopicName.DATA_PROCESSOR,
      event: EventName.PUSH_PAYLOAD_TO_DPC,
      key: EventKey.PUSH_PAYLOAD_TO_DPC,
      di_obj: {
        id: `${data.requestId}`,
        type: EventObjectType.DATA_SELF_SERVE,
        data: { ...data, date: dayjs().format('HH:mm DD/MM/YYYY') },
      },
      pr_obj: { id: `${data.user.id}`, type: EventObjectType.USER, data: data.user },
    });
    await KafkaAdapter.publish(eventData);
  }

  @OnEvent(DATA_SELF_SERVE_EVENTS.PUSH_FILE_INPUT_TO_S3)
  async pushFileInputToS3(data: DataSelfServeEventPayload) {
    const eventData = new EventData({
      id: `${data.requestId}`,
      topic: TopicName.DATA_VALIDATOR,
      event: EventName.PUSH_FILE_INPUT_TO_S3,
      key: EventKey.PUSH_FILE_INPUT_TO_S3,
      di_obj: { id: `${data.requestId}`, type: EventObjectType.DATA_SELF_SERVE, data },
      pr_obj: { id: `${data.user.id}`, type: EventObjectType.USER, data: data.user },
    });
    await KafkaAdapter.publish(eventData);
  }

  @OnEvent(DATA_SELF_SERVE_EVENTS.COMPLETED_REQUEST)
  async sendNotiCompletedRequest(data: DataSelfServeEventPayload) {
    const eventData = new EventData({
      id: `${data.requestId}`,
      topic: TopicName.NOTIFICATION,
      event: EventName.COMPLETED_DATA_SELF_SERVE_REQUEST,
      key: EventKey.COMPLETED_DATA_SELF_SERVE_REQUEST,
      di_obj: {
        id: `${data.requestId}`,
        type: EventObjectType.DATA_SELF_SERVE,
        data: { ...data, date: dayjs().format('HH:mm DD/MM/YYYY') },
      },
      pr_obj: { id: `${data.user.id}`, type: EventObjectType.USER, data: data.user },
    });
    await KafkaAdapter.publish(eventData);
  }
}
