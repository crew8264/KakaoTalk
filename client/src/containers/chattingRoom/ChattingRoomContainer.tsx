import React, { Component } from 'react';
import styled from 'styled-components';
import { Dispatch, bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { Header, Content, Footer } from '~/components/chattingRoom';
import { Portal } from '~/pages/Modal';
import { RootState } from '~/store/reducers';
import { ChatActions } from '~/store/actions/chat';
import { ProfileActions } from '~/store/actions/profile';
import { UserActions } from '~/store/actions/user';
import {
    ChattingDto, CreateRoomRequest, RoomType,
    ChattingRequestDto, FetchChattingRequest,
    ReadChatRequest, ReadChatResponse, UpdateRoomListDto
} from '~/types/chatting';
import { createRoom } from '~/apis/chat';


const Wrapper = styled.div`
    position: fixed;
    top: 0px;
    left: 0px;
    z-index: 99;
    width: 100%;
    height: 100vh;
    background: #b2c7d9;
`;

interface Props {
    rootState: RootState;
    chatActions: typeof ChatActions;
    profileActions: typeof ProfileActions;
    userActions: typeof UserActions;
}

let prevScrollHeight = 0;

class ChattingRoomContainer extends Component<Props> {
    messageRef: React.RefObject<HTMLDivElement>;

    constructor(props: Props) {
        super(props);
        this.messageRef = React.createRef<HTMLDivElement>();
        const userState = props.rootState.user;
        const chatState = props.rootState.chat;
        const roomList = userState.room_list;
        const findRoom = roomList.find(room => room.identifier === chatState.identifier);
        const participant = chatState.participant;

        const { fetchChattingRoomInfo, fetchChatting } = props.chatActions;

        if (findRoom) {
            const { updateRoomList } = props.userActions;
            const updateRoomObj: UpdateRoomListDto = {
                room_id: findRoom.room_id,
                not_read_chat: 0
            }
            updateRoomList(updateRoomObj);
            const roomObj: ChattingDto = {
                ...findRoom,
                participant,
                chatting: []
            }
            fetchChattingRoomInfo(roomObj);
            fetchChatting({
                room_id: findRoom.room_id,
                cursor: null,
            });
        }
        else {
            const createRoomObj: CreateRoomRequest  = {
                my_id: userState.id,
                type: chatState.type as RoomType,
                identifier: chatState.identifier,
                room_name: "",
                participant,
            }
            createRoom(createRoomObj).then(room => {
                const roomObj: ChattingDto = {
                    ...room,
                    participant,
                    chatting: [],
                }
                fetchChattingRoomInfo(roomObj);
            });
        }
    }

    componentDidMount() {
        this.messageRef.current!.addEventListener("scroll", this.handleScroll);

    }
    componentWillUnmount() {
        const socket = this.props.rootState.auth.socket;
        this.messageRef.current!.removeEventListener("scroll", this.handleScroll);
        socket!.off("readChat");
    }
    componentDidUpdate(prevProps: Props) {
        this.changeScroll(prevProps);
        this.updateFriendList(prevProps);
        this.readChat(prevProps);
    }
    handleScroll = () => {
        const messageRef = this.messageRef.current!;
        const scrollTop = messageRef.scrollTop;
        const chatState = this.props.rootState.chat
        const chatting = chatState.chatting;
        const { fetchChatting } = this.props.chatActions;
        if (!chatState.isFetchChattingLoading && scrollTop === 0) {
            const requestObj: FetchChattingRequest = {
                room_id: chatState.room_id,
                cursor: chatting[0].id
            }
            fetchChatting(requestObj);
            prevScrollHeight = messageRef.scrollHeight;
        }
    }

    changeScroll = (prevProps: Props) => {
        const prevChatState = prevProps.rootState.chat;
        const chatState = this.props.rootState.chat;
        const userState = this.props.rootState.user;
        const messageRef = this.messageRef.current!;
        const prevChattingLen = prevChatState.chatting.length;
        const currChattingLen = chatState.chatting.length;
        const currScrollHeight = messageRef.scrollHeight;
        if (prevChattingLen !== currChattingLen) {
            // 처음에 스크롤 가장 아래로
            if (prevChattingLen === 0) {
                messageRef.scrollTop = currScrollHeight;
            }
            else {
                const prevLastChat = prevChatState.chatting[prevChattingLen - 1];
                const currLastChat = chatState.chatting[currChattingLen - 1]
                // 무한 스크롤에서 스크롤 유지
                if (prevChatState.chatting[0].id !== chatState.chatting[0].id) {
                    messageRef.scrollTop = currScrollHeight - prevScrollHeight;
                }
                // 메시지 송수신 시 스크롤 변화
                else if (prevLastChat.id !== currLastChat.id) {
                    if (currLastChat.send_user_id === userState.id || currScrollHeight - messageRef.scrollTop <= messageRef.clientHeight + 100) {
                        messageRef.scrollTop = currScrollHeight;
                    }
                }
            }
        }
    }

    updateFriendList = (prevProps: Props) => {
        const prevFriendList = prevProps.rootState.user.friends_list;
        const currentFriendList = this.props.rootState.user.friends_list;
        if (prevFriendList !== currentFriendList) {
            const chatState = this.props.rootState.chat;
            const { fetchChattingRoomInfo } = this.props.chatActions;
            const participants = chatState.participant.map(participant => {
                const find = currentFriendList.find(friend => friend.id === participant.id);
                return find || participant;
            });
            fetchChattingRoomInfo({ ...chatState, participant: participants })
        }
    }
    readChat = (prevProps: Props) => {
        const prevChatting = prevProps.rootState.chat.chatting;
        const chatState = this.props.rootState.chat;
        const currChatting = chatState.chatting;
        const prevChattingLen = prevChatting.length;
        const currChattingLen = currChatting.length;

        if (prevChattingLen !== currChattingLen) {

            const lastReadChatId = chatState.last_read_chat_id;
            const lastChat = currChatting[currChattingLen - 1];
            if (lastChat.id !== lastReadChatId) {
                const socket = this.props.rootState.auth.socket;
                const userState = this.props.rootState.user;
                const { fetchChattingRoomInfo } = this.props.chatActions;
                const chatting = chatState.chatting;
                if(lastChat.send_user_id !== userState.id){
                    const updatedChatting = chatting.map(chat => {
                        if (chat.id > lastReadChatId) {
                            return { ...chat, not_read: chat.not_read - 1 }
                        }
                        return chat
                    });
                    const roomObj: ChattingDto = {
                        ...chatState,
                        chatting: updatedChatting,
                        last_read_chat_id: lastChat.id
                    }
                    fetchChattingRoomInfo(roomObj);
                    const obj: ReadChatRequest = {
                        user_id: userState.id,
                        room_id: chatState.room_id,
                        type: chatState.type as RoomType,
                        participant: chatState.participant,
                        last_read_chat_id: lastReadChatId,
                    }
    
                    socket!.emit("readChat", obj);
                    
                }
                else{
                    const roomObj: ChattingDto = {
                        ...chatState,
                        last_read_chat_id: lastChat.id
                    }
                    fetchChattingRoomInfo(roomObj)
                }                


                socket!.off("readChat");
                socket!.on("readChat", (res: ReadChatResponse) => {
                    if (chatState.room_id === res.room_id) {
                        const updatedChatting = chatting.map(chat => {
                            if (chat.id > res.last_read_chat_id) {
                                return { ...chat, not_read: chat.not_read - 1 }
                            }
                            return chat
                        });
                        const roomObj: ChattingDto = {
                            ...chatState,
                            chatting: updatedChatting,
                        }
                        fetchChattingRoomInfo(roomObj)
                    }
                })
            }

        }

    }
    render() {
        const userState = this.props.rootState.user;
        const chatState = this.props.rootState.chat;
        const authState = this.props.rootState.auth;
        const roomName = chatState.room_name || chatState.participant[0].name;
        const isMe = chatState.participant[0].id === userState.id;
        const { hideChattingRoom } = this.props.chatActions;
        const { showProfile } = this.props.profileActions;
        
        const onChatSumbmit = (msg: string) => {
            const chattingRequset: ChattingRequestDto = {
                room_id: chatState.room_id,
                type: chatState.type as RoomType,
                participant: chatState.participant,
                send_user_id: userState.id,
                message: msg,
                not_read: isMe ? 0 : chatState.participant.length,
            }
            authState.socket?.emit('message', chattingRequset);
        }
        return (
            <Portal>
                <Wrapper>
                    <Header room_name={roomName} hideRoom={hideChattingRoom} />
                    <Content myId={userState.id} participant={chatState.participant} chattingList={chatState.chatting} messageRef={this.messageRef} showProfile={showProfile} />
                    <Footer onChatSumbmit={onChatSumbmit} />
                </Wrapper>
            </Portal>
        )
    }
}

const mapStateToProps = (state: RootState) => ({
    rootState: state,
})

const mapDispatchToProps = (dispatch: Dispatch) => ({
    chatActions: bindActionCreators(ChatActions, dispatch),
    profileActions: bindActionCreators(ProfileActions, dispatch),
    userActions: bindActionCreators(UserActions, dispatch),
})


export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ChattingRoomContainer);


